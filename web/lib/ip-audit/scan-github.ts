import {
  type AuditReport, type Contributor, type Dependency,
  classify, inferDomain, classifyLicense, score, COPYLEFT,
  parseManifestText, MANIFEST_NAMES,
} from '@beneficialtechnology/repo-ip-auditor/core';

export class RateLimitError extends Error {}
export class NotFoundError extends Error {}

const MAX_PAGES = 5;               // 500 commits, 5 API calls
const SKIP_PATH = /(^|\/)(node_modules|vendor|third_party|thirdparty|\.venv|venv|dist|build|target|examples?|fixtures|testdata)(\/|$)/i;

export function parseRepo(value: string): { owner: string; repo: string } | null {
  const v = value.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = v.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i) ?? v.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

interface ScanInput {
  repo: string;
  domains: string[];
  token?: string;
  onProgress?: (message: string) => void;
}

export async function scanRepository(input: ScanInput): Promise<AuditReport> {
  const target = parseRepo(input.repo);
  if (!target) throw new Error('Enter a GitHub repository URL or owner/repo.');
  const { owner, repo } = target;
  const say = input.onProgress ?? (() => {});

  let remaining: string | null = null;
  const gh = async (path: string, soft = false): Promise<any> => {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (input.token) headers.Authorization = `Bearer ${input.token}`;
    const r = await fetch(`https://api.github.com${path}`, { headers });
    remaining = r.headers.get('x-ratelimit-remaining');
    if (r.status === 403 && remaining === '0') throw new RateLimitError('GitHub rate limit reached for this IP. Wait an hour or add a token.');
    if (r.status === 404) throw new NotFoundError('Repository not found. Private repositories need a token with repo scope.');
    if (!r.ok) { if (soft) return null; throw new Error(`GitHub returned ${r.status}.`); }
    return r.json();
  };

  say('Reading repository metadata');
  const meta = await gh(`/repos/${owner}/${repo}`);

  say('Walking commit history');
  const raw: any[] = [];
  let historyComplete = true;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await gh(`/repos/${owner}/${repo}/commits?per_page=100&page=${page}`, true);
    if (!batch?.length) break;
    raw.push(...batch);
    say(`Walking commit history (${raw.length} commits)`);
    if (batch.length < 100) break;
    if (page === MAX_PAGES) historyComplete = false;
  }

  const map = new Map<string, Contributor>();
  const bump = (name: string, email: string, date: string, viaTrailer: boolean) => {
    const key = email.toLowerCase().trim();
    if (!key.includes('@')) return;
    let c = map.get(key);
    if (!c) {
      c = { name: name.trim(), email: key, domain: key.split('@')[1] ?? '', commits: 0,
            coAuthoredOnly: viaTrailer, first: date, last: date, status: 'on-domain', note: '' };
      map.set(key, c);
    }
    c.commits++;
    if (!viaTrailer) c.coAuthoredOnly = false;
    if (date < c.first) c.first = date;
    if (date > c.last) c.last = date;
  };
  let trailers = 0;
  for (const c of raw) {
    const a = c.commit?.author;
    if (!a?.email) continue;
    bump(a.name ?? 'unknown', a.email, a.date, false);
    for (const m of String(c.commit?.message ?? '').matchAll(/^\s*Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim)) {
      bump(m[1], m[2], a.date, true);
      trailers++;
    }
  }

  let domains = input.domains.map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const inferredDomain = domains.length === 0;
  if (inferredDomain) {
    const guess = inferDomain([...map.values()]);
    if (guess) domains = [guess];
  }
  const contributors = classify([...map.values()], domains, []);

  say('Checking root license');
  const licenseInfo = await gh(`/repos/${owner}/${repo}/license`, true);
  const rootLicense: string | null = licenseInfo?.license?.spdx_id && licenseInfo.license.spdx_id !== 'NOASSERTION'
    ? licenseInfo.license.spdx_id
    : licenseInfo?.license?.name ?? null;

  say('Locating package manifests');
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`, true);
  const files: string[] = (tree?.tree ?? [])
    .filter((t: any) => t.type === 'blob' && MANIFEST_NAMES.includes(t.path.split('/').pop()) && !SKIP_PATH.test(t.path))
    .map((t: any) => t.path)
    .sort((a: string, b: string) => a.split('/').length - b.split('/').length)
    .slice(0, 8);

  let deps: Dependency[] = [];
  for (const path of files) {
    const file = await gh(`/repos/${owner}/${repo}/contents/${encodeURI(path)}`, true);
    if (!file?.content) continue;
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), ch => ch.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    deps.push(...parseManifestText(path.split('/').pop()!, text, path));
  }
  const seen = new Map<string, Dependency>();
  for (const d of deps) {
    const k = `${d.ecosystem}:${d.name.toLowerCase()}`;
    const prev = seen.get(k);
    if (!prev || (prev.scope === 'dev' && d.scope === 'runtime')) seen.set(k, d);
  }
  deps = [...seen.values()];

  const resolvable = deps.filter(d => ['npm', 'pypi', 'go', 'cargo'].includes(d.ecosystem)).slice(0, 140);
  say(`Resolving licenses for ${resolvable.length} packages`);
  await pool(resolvable, 8, async d => {
    d.license = await remoteLicense(d);
    d.cls = classifyLicense(d.license);
  });

  const flagged = deps.filter(d => COPYLEFT.includes(d.cls))
    .sort((a, b) => COPYLEFT.indexOf(a.cls) - COPYLEFT.indexOf(b.cls));
  const rootLicenseClass = classifyLicense(rootLicense);
  const s = score({ contributors, flagged, hasRootLicense: !!rootLicense, rootLicenseClass });

  const unresolved = deps.filter(d => d.cls === 'unknown').length;
  const warnings: string[] = [];
  if (!historyComplete) warnings.push(`Only the most recent ${raw.length} commits were read. The browser stops at ${MAX_PAGES * 100}. Run the CLI for full history.`);
  if (trailers) warnings.push(`${trailers} Co-authored-by trailers found. Those identities are counted as contributors.`);
  if (!files.length) warnings.push('No package manifests found. Dependency scoring did not run.');
  if (unresolved > 10) warnings.push(`${unresolved} dependencies have no machine-readable license and were not scored.`);
  warnings.push('Surface scan. File headers were not read, so vendored copyleft source and third-party copyright notices are not included. The CLI runs that check.');
  if (remaining && Number(remaining) <= 10) warnings.push(`${remaining} GitHub API calls left this hour.`);

  return {
    repo: `${owner}/${repo}`,
    generated: new Date().toISOString(),
    score: s.score, grade: s.grade, deductions: s.deductions,
    commitsScanned: raw.length, historyComplete, warnings,
    companyDomains: domains, inferredDomain,
    rootLicense, rootLicenseClass, contributors,
    dependencies: { total: deps.length, resolved: deps.length - unresolved, flagged },
    // The browser cannot read file headers without fetching every file, so it
    // never runs the deep scan and never carries its deductions.
    scanDepth: 'surface',
    headers: { findings: [], filesScanned: 0 },
  };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function json(url: string): Promise<any | null> {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

async function remoteLicense(d: Dependency): Promise<string | null> {
  if (d.ecosystem === 'npm') {
    const j = await json('https://registry.npmjs.org/' + d.name.split('/').map(encodeURIComponent).join('/') + '/latest');
    if (!j) return null;
    return typeof j.license === 'string' ? j.license : j.license?.type ?? null;
  }
  if (d.ecosystem === 'pypi') {
    const j = await json('https://pypi.org/pypi/' + encodeURIComponent(d.name) + '/json');
    if (!j) return null;
    if (j.info?.license_expression) return j.info.license_expression;           // PEP 639
    if (j.info?.license && j.info.license.length < 90) return j.info.license;
    const c = (j.info?.classifiers ?? []).find((x: string) => x.startsWith('License ::'));
    return c ? c.split('::').pop()!.trim() : null;
  }
  if (d.ecosystem === 'go' || d.ecosystem === 'cargo') {
    const base = `https://api.deps.dev/v3alpha/systems/${d.ecosystem === 'go' ? 'GO' : 'CARGO'}/packages/${encodeURIComponent(d.name)}`;
    const pkg = await json(base);
    const version = (pkg?.versions ?? []).find((v: any) => v.isDefault) ?? (pkg?.versions ?? []).at(-1);
    if (!version) return null;
    const v = await json(`${base}/versions/${encodeURIComponent(version.versionKey.version)}`);
    return (v?.licenses ?? []).join(' OR ') || null;
  }
  return null;
}
