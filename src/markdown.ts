import type { AuditReport } from './types.js';
import { LICENSE_LABEL } from './licenses.js';
import { RUBRIC, verdict } from './score.js';
import { STATUS_LABEL } from './identity.js';
import { HEADER_KIND_LABEL } from './headers.js';

/** Pure. Shared by the CLI, the Action job summary, and the web export. */
export function markdown(r: AuditReport): string {
  const risky = r.contributors.filter(x => x.status !== 'on-domain' && x.status !== 'automation' && x.status !== 'allowlisted');
  const out: string[] = [];
  out.push(`## IP chain-of-title audit: \`${r.repo}\``);
  out.push('');
  out.push(`**Grade ${r.grade} · ${r.score}/100** · ${r.commitsScanned} commits scanned · root license: ${r.rootLicense ?? '_none_'} · ${r.scanDepth === 'deep' ? `deep scan of ${r.headers.filesScanned} source files` : 'surface scan, file headers not read'}`);
  out.push('');
  out.push(verdict(r));
  out.push('');
  if (r.deductions.length) {
    out.push('### Deductions', '', '| Finding | Points |', '|---|---|');
    for (const d of r.deductions) out.push(`| ${d.label} | -${d.points} |`);
    out.push('');
  }
  if (risky.length) {
    out.push('### Contributors without assignment evidence', '', '| Identity | Commits | Active | Status |', '|---|---|---|---|');
    for (const x of risky.slice(0, 50)) out.push(`| \`${x.email}\` | ${x.commits} | ${x.first.slice(0, 7)} to ${x.last.slice(0, 7)} | ${STATUS_LABEL[x.status]} |`);
    out.push('');
  }
  if (r.dependencies.flagged.length) {
    out.push('### Copyleft exposure', '', '| Package | Class | Declared | Scope |', '|---|---|---|---|');
    for (const d of r.dependencies.flagged.slice(0, 50)) out.push(`| \`${d.name}\` | ${LICENSE_LABEL[d.cls]} | ${d.license ?? '—'} | ${d.scope}${d.direct ? '' : ', transitive'} |`);
    out.push('');
  }
  if (r.headers.findings.length) {
    out.push('### File header findings', '', '| Finding | Detail | File |', '|---|---|---|');
    for (const f of r.headers.findings.slice(0, 50))
      out.push(`| ${HEADER_KIND_LABEL[f.kind]} | ${f.detail} | \`${f.path}:${f.line}\` |`);
    if (r.headers.findings.length > 50) out.push(`| … | ${r.headers.findings.length - 50} more | |`);
    out.push('');
  }
  if (r.warnings.length) { out.push('### Notes', ''); for (const w of r.warnings) out.push(`- ${w}`); out.push(''); }
  out.push('<details><summary>Scoring rubric</summary>', '', '| Finding | Per item | Cap |', '|---|---|---|');
  for (const x of RUBRIC) out.push(`| ${x.label} | -${x.per} | ${x.cap} |`);
  out.push('', 'Grades: A 90+, B 75+, C 60+, D 40+, F below 40.', '</details>', '');
  out.push('_Engineering signal, not a legal opinion. No attorney-client relationship is created by running this tool._');
  return out.join('\n');
}
