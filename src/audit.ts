import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import type { AuditReport, Dependency } from './types.js';
import { readHistory, classify, inferDomain, git } from './git.js';
import { findManifests, parseManifest, resolveLicenses } from './deps.js';
import { classifyLicense, COPYLEFT } from './licenses.js';
import { score } from './score.js';
import { scanFileHeaders } from './filescan.js';

export interface AuditOptions {
  cwd: string;
  domains: string[];
  allowContributors: string[];
  allowPackages: string[];
  offline: boolean;
  since?: string;
  maxCommits?: number;
  /** Deep scan reads the head of every tracked source file. Default on. */
  headers?: boolean;
  company?: string;
  allowCopyright?: string[];
}

const LICENSE_FILES = /^(LICENSE|LICENCE|COPYING)([.\-][A-Za-z0-9.]+)?$/i;

function rootLicense(root: string): { name: string | null; text: string | null } {
  const pkg = join(root, 'package.json');
  if (existsSync(pkg)) {
    try {
      const j = JSON.parse(readFileSync(pkg, 'utf8'));
      const l = typeof j.license === 'string' ? j.license : j.license?.type;
      if (l) return { name: l, text: null };
    } catch { /* ignore */ }
  }
  const file = readdirSync(root).find(f => LICENSE_FILES.test(f));
  if (!file) return { name: null, text: null };
  try {
    const text = readFileSync(join(root, file), 'utf8').slice(0, 4000);
    const head = text.split('\n').slice(0, 12).join(' ');
    return { name: head.match(/(GNU AFFERO[^\n.]*|GNU LESSER[^\n.]*|GNU GENERAL PUBLIC[^\n.]*|MIT License|Apache License[^\n.]*|BSD[^\n.]*|Mozilla Public License[^\n.]*|ISC License)/i)?.[1]?.trim() ?? basename(file), text };
  } catch { return { name: basename(file), text: null }; }
}

export async function audit(opts: AuditOptions): Promise<AuditReport> {
  const root = resolve(opts.cwd);
  const history = readHistory({ cwd: root, since: opts.since, maxCommits: opts.maxCommits });

  let domains = opts.domains.map(d => d.toLowerCase().replace(/^@/, '')).filter(Boolean);
  const inferred = domains.length === 0;
  if (inferred) {
    const guess = inferDomain([...history.contributors.values()]);
    if (guess) domains = [guess];
  }
  const contributors = classify([...history.contributors.values()], domains, opts.allowContributors);

  let deps: Dependency[] = [];
  const manifests = findManifests(root);
  for (const m of manifests) {
    try { deps.push(...parseManifest(m, readFileSync(m, 'utf8'), root)); } catch { /* skip */ }
  }
  deps = await resolveLicenses(deps, root, opts.offline);

  const allow = new Set(opts.allowPackages.map(p => p.toLowerCase()));
  const flagged = deps
    .filter(d => COPYLEFT.includes(d.cls))
    .filter(d => !allow.has(d.name.toLowerCase()) && !allow.has(`${d.ecosystem}:${d.name}`.toLowerCase()))
    .sort((a, b) => COPYLEFT.indexOf(a.cls) - COPYLEFT.indexOf(b.cls));

  const rl = rootLicense(root);
  const rootCls = classifyLicense(rl.name ?? rl.text?.slice(0, 400));

  const deep = opts.headers !== false;
  const headerScan = deep
    ? scanFileHeaders({ cwd: root, domains, company: opts.company, allowCopyright: opts.allowCopyright })
    : { findings: [], filesScanned: 0, truncated: false };

  const s = score({
    contributors, flagged, hasRootLicense: !!rl.name, rootLicenseClass: rootCls,
    headers: deep ? headerScan.findings : undefined,
  });

  const warnings = [...history.warnings];
  if (opts.offline) warnings.push('Offline mode. Only licenses found on disk were resolved.');
  const unresolved = deps.filter(d => d.cls === 'unknown').length;
  if (unresolved > 10) warnings.push(`${unresolved} dependencies have no machine-readable license and were not scored.`);
  if (!manifests.length) warnings.push('No package manifests found. Dependency scoring did not run.');
  if (!deep) warnings.push('Header scanning was skipped. File-level findings are not included in the score.');
  if (headerScan.truncated) warnings.push('More than 20,000 source files are tracked. Header scanning stopped at the limit.');
  if (['agpl','gpl','lgpl','weak','source-available'].includes(rootCls) && headerScan.findings.some(f => f.kind !== 'foreign-copyright'))
    warnings.push('The repository is itself copyleft, so copyleft file headers are reported but not deducted.');

  let repo = basename(root);
  try { repo = git(['config', '--get', 'remote.origin.url'], root).replace(/\.git$/, '').split(/[:/]/).slice(-2).join('/'); } catch { /* local only */ }

  return {
    repo, generated: new Date().toISOString(),
    score: s.score, grade: s.grade, deductions: s.deductions,
    commitsScanned: history.commitCount, historyComplete: history.complete, warnings,
    companyDomains: domains, inferredDomain: inferred,
    rootLicense: rl.name, rootLicenseClass: rootCls,
    contributors,
    dependencies: { total: deps.length, resolved: deps.length - unresolved, flagged },
    scanDepth: deep ? 'deep' : 'surface',
    headers: { findings: headerScan.findings, filesScanned: headerScan.filesScanned },
  };
}
