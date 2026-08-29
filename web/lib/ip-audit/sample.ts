import {
  type AuditReport, type Contributor, type Dependency,
  classify, classifyLicense, score, COPYLEFT,
} from '@beneficialtechnology/repo-ip-auditor/core';

/** The sample is scored by the same function as a live audit, so it cannot
 *  drift from the rubric. Every name and package below is fictional. */
const DOMAINS = ['fictional-org.io'];

const rawContributors: Contributor[] = ([
  ['Sarah Chen', 'sarah@fictional-org.io', 128, '2024-02-11', '2026-08-02'],
  ['Alex Rivera', 'alex@fictional-org.io', 74, '2024-05-03', '2026-07-19'],
  ['Marcus Brody', 'marcus@fictional-org.io', 41, '2024-09-16', '2026-06-04'],
  ['J. Vance', 'jvance.dev@gmail.com', 34, '2024-03-20', '2024-11-08'],
  ['DevStudio', 'contractor@devstudio-outsourcing.com', 22, '2024-06-01', '2025-01-27'],
  ['unknown', '123456+user@users.noreply.github.com', 7, '2025-09-02', '2025-10-11'],
  ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com', 61, '2024-02-20', '2026-08-10'],
] as const).map(([name, email, commits, first, last]) => ({
  name, email, domain: email.split('@')[1], commits, coAuthoredOnly: false,
  first: `${first}T00:00:00Z`, last: `${last}T00:00:00Z`,
  status: 'on-domain' as const, note: '',
}));

const rawDeps: Array<[string, Dependency['ecosystem'], string | null, Dependency['scope'], string]> = [
  ['lib-fast-pdf', 'pypi', 'GPL-3.0', 'runtime', 'requirements.txt'],
  ['audio-codec-stream', 'cargo', 'LGPL-3.0-only', 'runtime', 'Cargo.toml'],
  ['testing-mock-server', 'npm', 'AGPL-3.0', 'dev', 'package.json'],
  ['fictional-http', 'npm', 'MIT', 'runtime', 'package.json'],
  ['fictional-tokio', 'cargo', 'MIT', 'runtime', 'Cargo.toml'],
  ['fictional-router', 'go', 'MIT', 'runtime', 'go.mod'],
  ['fictional-queue', 'go', null, 'runtime', 'go.mod'],
];

export function sampleReport(): AuditReport {
  const contributors = classify(rawContributors, DOMAINS, []);
  const dependencies: Dependency[] = rawDeps.map(([name, ecosystem, license, scope, source]) => ({
    name, ecosystem, license, cls: classifyLicense(license), scope, direct: true, source,
  }));
  const flagged = dependencies.filter(d => COPYLEFT.includes(d.cls))
    .sort((a, b) => COPYLEFT.indexOf(a.cls) - COPYLEFT.indexOf(b.cls));
  const s = score({ contributors, flagged, hasRootLicense: true, rootLicenseClass: 'permissive' });

  return {
    repo: 'fictional-org/core-engine',
    generated: new Date().toISOString(),
    score: s.score, grade: s.grade, deductions: s.deductions,
    commitsScanned: contributors.reduce((n, c) => n + c.commits, 0),
    historyComplete: true,
    warnings: ['Sample data. No repository was scanned and no network calls were made.'],
    companyDomains: DOMAINS, inferredDomain: false,
    rootLicense: 'MIT', rootLicenseClass: 'permissive',
    contributors,
    dependencies: { total: dependencies.length, resolved: dependencies.filter(d => d.license).length, flagged },
    scanDepth: 'surface',
    headers: { findings: [], filesScanned: 0 },
  };
}
