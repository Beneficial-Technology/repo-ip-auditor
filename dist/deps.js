import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { classifyLicense } from './licenses.js';
import { parseManifestText, MANIFEST_NAMES } from './manifests.js';
const MANIFESTS = MANIFEST_NAMES;
const SKIP = /^(node_modules|vendor|third_party|thirdparty|\.git|\.venv|venv|dist|build|target|fixtures|testdata|\.next)$/i;
export function findManifests(root, max = 24) {
    const out = [];
    const walk = (dir, depth) => {
        if (out.length >= max || depth > 4)
            return;
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const e of entries) {
            const p = join(dir, e);
            let s;
            try {
                s = statSync(p);
            }
            catch {
                continue;
            }
            if (s.isDirectory()) {
                if (!SKIP.test(e) && !e.startsWith('.'))
                    walk(p, depth + 1);
            }
            else if (MANIFESTS.includes(e))
                out.push(p);
        }
    };
    walk(root, 0);
    return out.sort((a, b) => a.split(/[/\\]/).length - b.split(/[/\\]/).length);
}
export function parseManifest(path, text, root) {
    return parseManifestText(basename(path), text, relative(root, path) || basename(path));
}
/** Installed packages are the truth. If node_modules or a site-packages tree is
 *  present we read licenses off disk, which also covers transitive dependencies
 *  that no manifest lists. */
export function readInstalledLicenses(root) {
    const map = new Map();
    const npmDir = (dir, depth) => {
        if (depth > 3 || !existsSync(dir))
            return;
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e === '.bin' || e === '.cache')
                continue;
            const p = join(dir, e);
            if (e.startsWith('@')) {
                npmDir(p, depth);
                continue;
            }
            const pkg = join(p, 'package.json');
            if (existsSync(pkg)) {
                try {
                    const j = JSON.parse(readFileSync(pkg, 'utf8'));
                    const lic = typeof j.license === 'string' ? j.license
                        : j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((x) => x.type).join(' OR ') : null);
                    if (j.name && lic)
                        map.set('npm:' + j.name, { license: lic, ecosystem: 'npm' });
                }
                catch { /* skip */ }
            }
            npmDir(join(p, 'node_modules'), depth + 1);
        }
    };
    npmDir(join(root, 'node_modules'), 0);
    const pyRoots = ['.venv/lib', 'venv/lib', 'lib'].map(p => join(root, p)).filter(existsSync);
    for (const r of pyRoots) {
        const stack = [r];
        let guard = 0;
        while (stack.length && guard++ < 5000) {
            const dir = stack.pop();
            let entries;
            try {
                entries = readdirSync(dir);
            }
            catch {
                continue;
            }
            for (const e of entries) {
                const p = join(dir, e);
                if (e.endsWith('.dist-info')) {
                    try {
                        const meta = readFileSync(join(p, 'METADATA'), 'utf8');
                        const name = meta.match(/^Name:\s*(.+)$/m)?.[1]?.trim();
                        const lic = meta.match(/^License-Expression:\s*(.+)$/m)?.[1]
                            ?? meta.match(/^License:\s*(.+)$/m)?.[1]
                            ?? meta.match(/^Classifier:\s*License ::\s*(.+)$/m)?.[1];
                        if (name && lic)
                            map.set('pypi:' + name.toLowerCase(), { license: lic.trim(), ecosystem: 'pypi' });
                    }
                    catch { /* skip */ }
                }
                else if (!e.includes('.')) {
                    try {
                        if (statSync(p).isDirectory())
                            stack.push(p);
                    }
                    catch { /* skip */ }
                }
            }
        }
    }
    return map;
}
async function fetchJson(url, ms = 8000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
        const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'repo-ip-auditor' } });
        return r.ok ? await r.json() : null;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(t);
    }
}
async function remoteLicense(d) {
    if (d.ecosystem === 'npm') {
        const j = await fetchJson('https://registry.npmjs.org/' + d.name.split('/').map(encodeURIComponent).join('/') + '/latest');
        if (!j)
            return null;
        return typeof j.license === 'string' ? j.license : j.license?.type ?? null;
    }
    if (d.ecosystem === 'pypi') {
        const j = await fetchJson('https://pypi.org/pypi/' + encodeURIComponent(d.name) + '/json');
        if (!j)
            return null;
        if (j.info?.license_expression)
            return j.info.license_expression;
        if (j.info?.license && j.info.license.length < 90)
            return j.info.license;
        const c = (j.info?.classifiers ?? []).find((x) => x.startsWith('License ::'));
        return c ? c.split('::').pop().trim() : null;
    }
    if (d.ecosystem === 'go' || d.ecosystem === 'cargo') {
        const system = d.ecosystem === 'go' ? 'GO' : 'CARGO';
        const j = await fetchJson(`https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(d.name)}`);
        const v = j?.versions?.[j.versions.length - 1];
        return v?.licenses?.join(' OR ') ?? null;
    }
    return null;
}
async function pool(items, n, fn) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) {
            const k = i++;
            out[k] = await fn(items[k]);
        }
    }));
    return out;
}
export async function resolveLicenses(deps, root, offline) {
    const installed = readInstalledLicenses(root);
    // transitive packages found on disk but absent from any manifest
    const declared = new Set(deps.map(d => d.ecosystem + ':' + d.name.toLowerCase()));
    for (const [key, v] of installed) {
        const name = key.slice(key.indexOf(':') + 1);
        if (declared.has(v.ecosystem + ':' + name.toLowerCase()))
            continue;
        deps.push({ name, ecosystem: v.ecosystem, license: v.license, cls: classifyLicense(v.license), scope: 'runtime', direct: false, source: 'installed tree' });
    }
    for (const d of deps) {
        if (d.license)
            continue;
        const hit = installed.get(d.ecosystem + ':' + (d.ecosystem === 'pypi' ? d.name.toLowerCase() : d.name));
        if (hit) {
            d.license = hit.license;
            d.cls = classifyLicense(hit.license);
        }
    }
    if (!offline) {
        const todo = deps.filter(d => !d.license && ['npm', 'pypi', 'go', 'cargo'].includes(d.ecosystem)).slice(0, 300);
        const got = await pool(todo, 10, remoteLicense);
        todo.forEach((d, i) => { d.license = got[i]; d.cls = classifyLicense(got[i]); });
    }
    const seen = new Map();
    for (const d of deps) {
        const k = d.ecosystem + ':' + d.name.toLowerCase();
        const prev = seen.get(k);
        if (!prev || (prev.scope === 'dev' && d.scope === 'runtime') || (!prev.license && d.license))
            seen.set(k, d);
    }
    return [...seen.values()];
}
