import { LICENSE_LABEL } from './licenses.js';
import { HEADER_KIND_SHORT } from './headers.js';
import { verdict } from './score.js';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim = (s) => c('2', s), bold = (s) => c('1', s);
const red = (s) => c('31', s), yellow = (s) => c('33', s), green = (s) => c('32', s);
const gradeColor = (g) => g === 'A' || g === 'B' ? green : g === 'C' ? yellow : red;
import { STATUS_LABEL } from './identity.js';
export function terminal(r) {
    const L = [];
    const g = gradeColor(r.grade);
    L.push('');
    L.push(bold(`  ${r.repo}`) + dim(`  ${r.commitsScanned} commits`));
    L.push(`  ${g(bold(`Grade ${r.grade}`))}  ${bold(String(r.score))}${dim('/100')}   ${dim(verdict(r).split('.')[0] + '.')}`);
    L.push('');
    if (r.deductions.length) {
        L.push(dim('  DEDUCTIONS'));
        for (const d of r.deductions)
            L.push(`  ${red('-' + String(d.points).padEnd(3))} ${d.label}`);
        L.push('');
    }
    const risky = r.contributors.filter(x => x.status === 'unassigned-consumer' || x.status === 'third-party-domain' || x.status === 'identity-masked');
    if (risky.length) {
        L.push(dim('  CHAIN OF TITLE'));
        for (const x of risky.slice(0, 25)) {
            const tag = x.status === 'identity-masked' ? yellow(STATUS_LABEL[x.status]) : red(STATUS_LABEL[x.status]);
            L.push(`  ${tag.padEnd(useColor ? 22 : 13)} ${x.email.padEnd(38)} ${dim(String(x.commits) + ' commits  ' + x.first.slice(0, 7) + ' to ' + x.last.slice(0, 7))}`);
        }
        if (risky.length > 25)
            L.push(dim(`  and ${risky.length - 25} more`));
        L.push('');
    }
    if (r.dependencies.flagged.length) {
        L.push(dim('  LICENSE EXPOSURE'));
        for (const d of r.dependencies.flagged.slice(0, 25)) {
            const label = LICENSE_LABEL[d.cls];
            const paint = d.cls === 'agpl' || d.cls === 'gpl' || d.cls === 'source-available' ? red : yellow;
            L.push(`  ${paint(label.padEnd(useColor ? 26 : 17))} ${d.name.padEnd(34)} ${dim(`${d.scope}${d.direct ? '' : ', transitive'}  ${d.license ?? ''}`)}`);
        }
        if (r.dependencies.flagged.length > 25)
            L.push(dim(`  and ${r.dependencies.flagged.length - 25} more`));
        L.push('');
    }
    if (r.headers.findings.length) {
        L.push(dim('  FILE HEADERS'));
        const byKind = new Map();
        for (const f of r.headers.findings) {
            const k = f.kind === 'foreign-copyright' ? 'foreign-copyright:' + f.detail.toLowerCase() : f.kind;
            if (!byKind.has(k))
                byKind.set(k, []);
            byKind.get(k).push(f);
        }
        for (const [, group] of [...byKind.entries()].slice(0, 12)) {
            const first = group[0];
            const paint = first.kind === 'foreign-copyright' ? yellow : red;
            L.push(`  ${paint(HEADER_KIND_SHORT[first.kind].padEnd(useColor ? 26 : 17))} ${first.detail}`);
            for (const f of group.slice(0, 3))
                L.push(dim(`      ${f.path}:${f.line}`));
            if (group.length > 3)
                L.push(dim(`      and ${group.length - 3} more files`));
        }
        L.push('');
    }
    for (const w of r.warnings)
        L.push(`  ${yellow('!')} ${dim(w)}`);
    L.push('');
    if (r.scanDepth === 'deep')
        L.push(dim(`  ${r.headers.filesScanned} source files header-scanned`));
    L.push(dim(`  ${r.dependencies.resolved}/${r.dependencies.total} dependency licenses resolved · domains: ${r.companyDomains.join(', ') || 'none'}${r.inferredDomain ? ' (inferred)' : ''}`));
    L.push(dim('  Engineering signal, not a legal opinion.'));
    L.push('');
    return L.join('\n');
}
export { markdown } from './markdown.js';
