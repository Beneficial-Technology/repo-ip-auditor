import type { AuditReport, Contributor, Dependency, Deduction } from './types.js';
import type { HeaderFinding } from './headers.js';
import { STRONG_COPYLEFT } from './licenses.js';

/** Published rubric. Fixed deductions from a base of 100, no hidden weighting.
 *  Must stay identical to the browser build or the two tools disagree. */
export const RUBRIC = [
  { id: 'consumer',   label: 'Unassigned contributor, consumer email domain', per: 6,  cap: 30 },
  { id: 'thirdparty', label: 'Unassigned contributor, other corporate domain', per: 9,  cap: 30 },
  { id: 'agpl',       label: 'AGPL or source-available runtime dependency',    per: 25, cap: 45 },
  { id: 'gpl',        label: 'GPL runtime dependency',                          per: 15, cap: 45 },
  { id: 'weak',       label: 'LGPL, MPL or EPL runtime dependency',             per: 4,  cap: 12 },
  { id: 'dev',        label: 'Copyleft in dev dependencies only',               per: 2,  cap: 6  },
  { id: 'nolicense',  label: 'No root LICENSE file',                            per: 10, cap: 10 },
  { id: 'copyleftroot', label: 'Repository root license is copyleft',           per: 20, cap: 20 },
  { id: 'headercopyleft', label: 'Committed source file under a copyleft header (deep scan)', per: 12, cap: 36 },
  { id: 'vendored',      label: 'Vendored copyleft license file (deep scan)',    per: 8,  cap: 24 },
  { id: 'foreigncopy',   label: 'Third-party copyright holder in source (deep scan)', per: 5, cap: 20 },
];

const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`;

export function score(input: {
  contributors: Contributor[];
  flagged: Dependency[];
  hasRootLicense: boolean;
  rootLicenseClass: string;
  /** Deep-scan findings. Omit for a surface scan: the browser cannot read file
   *  headers without fetching every file, so it never supplies these. */
  headers?: HeaderFinding[];
}): { score: number; grade: string; deductions: Deduction[] } {
  const d: Deduction[] = [];
  const add = (label: string, count: number, id: string) => {
    if (!count) return;
    const r = RUBRIC.find(x => x.id === id)!;
    d.push({ label, points: Math.min(count * r.per, r.cap) });
  };

  const consumer = input.contributors.filter(c => c.status === 'unassigned-consumer').length;
  const third = input.contributors.filter(c => c.status === 'third-party-domain').length;
  add(plural(consumer, 'unassigned contributor') + ' on consumer email', consumer, 'consumer');
  add(plural(third, 'contributor') + ' on outside corporate domains', third, 'thirdparty');

  const runtime = input.flagged.filter(f => f.scope === 'runtime');
  const strong = runtime.filter(f => STRONG_COPYLEFT.includes(f.cls)).length;
  const gpl = runtime.filter(f => f.cls === 'gpl').length;
  const weak = runtime.filter(f => f.cls === 'lgpl' || f.cls === 'weak').length;
  const devOnly = input.flagged.filter(f => f.scope === 'dev').length;

  // strong and GPL share one cap: a repo cannot lose more than 45 on copyleft
  const strongPts = Math.min(strong * 25 + gpl * 15, 45);
  if (strongPts) d.push({ label: plural(strong + gpl, 'strong copyleft runtime dependency', 'strong copyleft runtime dependencies'), points: strongPts });
  add(plural(weak, 'weak copyleft runtime dependency', 'weak copyleft runtime dependencies'), weak, 'weak');
  add(plural(devOnly, 'copyleft dev dependency', 'copyleft dev dependencies'), devOnly, 'dev');

  const h = input.headers ?? [];
  // A repository that is itself copyleft is not contaminated by copyleft
  // headers. Those findings are still reported, they just are not deductions.
  const selfCopyleft = ['agpl', 'gpl', 'lgpl', 'weak', 'source-available'].includes(input.rootLicenseClass);
  const copyleftFiles = new Set(h.filter(x => x.kind === 'spdx-copyleft' || x.kind === 'license-text').map(x => x.path)).size;
  const vendored = h.filter(x => x.kind === 'vendored-license').length;
  const holders = new Set(h.filter(x => x.kind === 'foreign-copyright').map(x => x.detail.toLowerCase())).size;
  if (!selfCopyleft) {
    add(plural(copyleftFiles, 'committed source file', 'committed source files') + ' under a copyleft header', copyleftFiles, 'headercopyleft');
    add(plural(vendored, 'vendored copyleft license file') + ' in a subdirectory', vendored, 'vendored');
  }
  add(plural(holders, 'third-party copyright holder') + ' in committed source', holders, 'foreigncopy');

  if (!input.hasRootLicense) d.push({ label: 'No root LICENSE file', points: 10 });
  else if (['agpl', 'gpl', 'lgpl'].includes(input.rootLicenseClass)) d.push({ label: 'Repository root license is copyleft', points: 20 });

  const total = Math.max(0, 100 - d.reduce((s, x) => s + x.points, 0));
  return { score: total, grade: grade(total), deductions: d };
}

export const grade = (n: number) => n >= 90 ? 'A' : n >= 75 ? 'B' : n >= 60 ? 'C' : n >= 40 ? 'D' : 'F';

export function verdict(r: AuditReport): string {
  if (r.score >= 90) return 'Chain of title looks clean on the evidence in this history. Keep assignment records current as the team grows.';
  if (r.score >= 75) return 'Mostly clean. A small number of items need paper before a diligence review, and each is cheap to fix now.';
  if (r.score >= 60) return 'Diligence stalls here. The gaps are ordinary and fixable, but chasing signatures after a term sheet takes weeks.';
  return 'Material chain-of-title and licensing exposure. Assume counsel finds every item below before you open a data room.';
}
