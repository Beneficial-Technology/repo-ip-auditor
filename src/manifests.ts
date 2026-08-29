import type { Dependency } from './types.js';

export const MANIFEST_NAMES = ['package.json','requirements.txt','pyproject.toml','go.mod','Cargo.toml','composer.json','Gemfile'];

/** Pure manifest parsing. Shared by the CLI and the browser so both read the
 *  same dependency set out of the same files. */
export function parseManifestText(base: string, text: string, src: string): Dependency[] {
  const out: Dependency[] = [];
  const push = (name: string, ecosystem: Dependency['ecosystem'], dev = false) => {
    name = (name || '').trim();
    if (!name || name.startsWith('.') || name.startsWith('-')) return;
    out.push({ name, ecosystem, license: null, cls: 'unknown', scope: dev ? 'dev' : 'runtime', direct: true, source: src });
  };
  try {
    if (base === 'package.json') {
      const j = JSON.parse(text);
      Object.keys(j.dependencies ?? {}).forEach(n => push(n, 'npm'));
      Object.keys(j.peerDependencies ?? {}).forEach(n => push(n, 'npm'));
      Object.keys(j.optionalDependencies ?? {}).forEach(n => push(n, 'npm'));
      Object.keys(j.devDependencies ?? {}).forEach(n => push(n, 'npm', true));
    } else if (base === 'requirements.txt') {
      for (let line of text.split('\n')) {
        line = line.split('#')[0].trim();
        if (!line || line.startsWith('-')) continue;
        push(line.split(/[<>=!~\[;\s]/)[0], 'pypi');
      }
    } else if (base === 'pyproject.toml') {
      for (const block of text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/g) ?? [])
        for (const q of block.match(/["']([^"']+)["']/g) ?? [])
          push(q.replace(/["']/g, '').split(/[<>=!~\[;\s]/)[0], 'pypi');
      const poetry = text.split('[tool.poetry.dependencies]')[1];
      if (poetry) for (const line of poetry.split(/\n\[/)[0].split('\n')) {
        const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
        if (m && m[1].toLowerCase() !== 'python') push(m[1], 'pypi');
      }
    } else if (base === 'go.mod') {
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+v/i);
        if (m) push(m[1], 'go');
      }
    } else if (base === 'Cargo.toml') {
      let section = '';
      for (const line of text.split('\n')) {
        const h = line.match(/^\s*\[([^\]]+)\]/);
        if (h) { section = h[1]; continue; }
        if (!/dependencies$/.test(section)) continue;
        const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
        if (m) push(m[1], 'cargo', /dev-dependencies$/.test(section));
      }
    } else if (base === 'composer.json') {
      const j = JSON.parse(text);
      Object.keys(j.require ?? {}).forEach(n => { if (n !== 'php' && !n.startsWith('ext-')) push(n, 'packagist'); });
      Object.keys(j['require-dev'] ?? {}).forEach(n => push(n, 'packagist', true));
    } else if (base === 'Gemfile') {
      for (const m of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) push(m[1], 'rubygems');
    }
  } catch { /* malformed manifest: report nothing rather than guess */ }
  return out;
}

