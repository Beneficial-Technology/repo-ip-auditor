#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { audit } from './audit.js';
import { loadConfig } from './config.js';
import { terminal, markdown } from './report.js';
import { RUBRIC } from './score.js';
const HELP = `
repo-ip-audit  Audit a git repository for IP chain-of-title and copyleft exposure.

  repo-ip-audit [path] [options]

  --domains a.com,b.com   Company email domains. Inferred from history if omitted.
  --min-score 75          Exit 1 when the score falls below this.
  --format text|json|md   Output format. Default: text.
  --out FILE              Write the report to a file instead of stdout.
  --offline               Skip registry lookups. Only reads licenses on disk.
  --no-headers            Skip the file header scan (faster, surface scan only).
  --company "Acme, Inc."  Copyright holder to treat as your own.
  --since 2023-01-01      Limit history by date.
  --max-commits 5000      Limit history by count.
  --rubric                Print the scoring rubric and exit.
  --help

Config: ipaudit.config.json in the repo root.
  { "domains": ["acme.com"], "company": "Acme, Inc.",
    "allowContributors": ["ex@dev.io"], "allowPackages": ["npm:some-lgpl-lib"],
    "allowCopyright": ["Acme Holdings"], "minScore": 80 }

Engineering signal, not a legal opinion.
`;
const VALUE_FLAGS = ['--domains', '--min-score', '--format', '--out', '--since', '--max-commits', '--company'];
function arg(flag, argv) {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
}
function positional(argv) {
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('-')) {
            if (VALUE_FLAGS.includes(argv[i]))
                i++;
            continue;
        }
        return argv[i];
    }
    return '.';
}
async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log(HELP);
        return;
    }
    if (argv.includes('--rubric')) {
        for (const r of RUBRIC)
            console.log(`-${String(r.per).padEnd(3)} ${r.label.padEnd(52)} cap ${r.cap}`);
        console.log('\nGrades: A 90+, B 75+, C 60+, D 40+, F below 40.');
        return;
    }
    const cwd = positional(argv);
    const cfg = loadConfig(cwd);
    const report = await audit({
        cwd,
        domains: (arg('--domains', argv) ?? cfg.domains?.join(',') ?? '').split(',').map(s => s.trim()).filter(Boolean),
        allowContributors: cfg.allowContributors ?? [],
        allowPackages: cfg.allowPackages ?? [],
        offline: argv.includes('--offline') || !!cfg.offline,
        headers: !argv.includes('--no-headers'),
        company: arg('--company', argv) ?? cfg.company,
        allowCopyright: cfg.allowCopyright ?? [],
        since: arg('--since', argv),
        maxCommits: arg('--max-commits', argv) ? Number(arg('--max-commits', argv)) : undefined,
    });
    const format = arg('--format', argv) ?? 'text';
    const body = format === 'json' ? JSON.stringify(report, null, 2)
        : format === 'md' || format === 'markdown' ? markdown(report)
            : terminal(report);
    const out = arg('--out', argv);
    if (out) {
        writeFileSync(out, body);
        console.error(`Report written to ${out}`);
    }
    else
        console.log(body);
    const min = arg('--min-score', argv) ? Number(arg('--min-score', argv)) : cfg.minScore;
    if (min !== undefined && report.score < min) {
        console.error(`\nScore ${report.score} is below the ${min} threshold.`);
        process.exit(1);
    }
}
main().catch(e => { console.error('repo-ip-audit: ' + (e?.message ?? e)); process.exit(2); });
