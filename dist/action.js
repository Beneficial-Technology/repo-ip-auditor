import { appendFileSync } from 'node:fs';
import { audit } from './audit.js';
import { loadConfig } from './config.js';
import { markdown } from './report.js';
/** GitHub Action entrypoint. Reads INPUT_* env vars, writes a job summary,
 *  sets outputs, and fails the job when the score falls below min-score. */
const input = (name) => process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`]?.trim() ?? '';
async function main() {
    const cwd = input('path') || '.';
    const cfg = loadConfig(cwd);
    const report = await audit({
        cwd,
        domains: (input('domains') || cfg.domains?.join(',') || '').split(',').map(s => s.trim()).filter(Boolean),
        allowContributors: cfg.allowContributors ?? [],
        allowPackages: cfg.allowPackages ?? [],
        offline: input('offline') === 'true' || !!cfg.offline,
        headers: input('headers') !== 'false',
        company: input('company') || cfg.company,
        allowCopyright: cfg.allowCopyright ?? [],
    });
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary)
        appendFileSync(summary, markdown(report) + '\n');
    else
        console.log(markdown(report));
    for (const f of report.headers.findings.slice(0, 30))
        console.log(`::warning file=${f.path},line=${f.line}::${f.kind === 'foreign-copyright' ? 'Third-party copyright holder: ' + f.detail : 'Copyleft header: ' + f.detail}`);
    const out = process.env.GITHUB_OUTPUT;
    if (out)
        appendFileSync(out, [
            `score=${report.score}`,
            `grade=${report.grade}`,
            `unassigned=${report.contributors.filter(c => c.status === 'unassigned-consumer' || c.status === 'third-party-domain').length}`,
            `copyleft=${report.dependencies.flagged.length}`,
            `header_findings=${report.headers.findings.length}`,
            `report<<EOF_REPORT\n${markdown(report)}\nEOF_REPORT`,
        ].join('\n') + '\n');
    if (!report.historyComplete)
        console.log('::warning::Shallow clone detected. Set fetch-depth: 0 on actions/checkout or the contributor list is incomplete.');
    for (const c of report.contributors.filter(x => x.status === 'unassigned-consumer' || x.status === 'third-party-domain'))
        console.log(`::warning::No IP assignment evidence for ${c.email} (${c.commits} commits)`);
    const min = Number(input('min-score') || cfg.minScore || 0);
    console.log(`Grade ${report.grade}, score ${report.score}/100.`);
    if (min && report.score < min) {
        console.log(`::error::IP audit score ${report.score} is below the required ${min}.`);
        process.exit(1);
    }
}
main().catch(e => { console.log(`::error::${e?.message ?? e}`); process.exit(1); });
