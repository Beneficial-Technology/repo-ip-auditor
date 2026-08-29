import { execFileSync } from 'node:child_process';
import type { Contributor } from './types.js';
export { classify, inferDomain, FREEMAIL, isBot } from './identity.js';

const RS = '\x1e', FS = '\x1f';

export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
}

export interface HistoryOptions { cwd: string; since?: string; maxCommits?: number }

export interface History {
  contributors: Map<string, Contributor>;
  commitCount: number;
  complete: boolean;
  warnings: string[];
}

/** Reads the full local history. This is the reason the CLI exists: it sees
 *  private repos, complete history, .mailmap identities, and Co-authored-by
 *  trailers that squash merges leave behind. The web build sees none of that. */
export function readHistory(opts: HistoryOptions): History {
  const { cwd } = opts;
  const warnings: string[] = [];

  try { git(['rev-parse', '--git-dir'], cwd); }
  catch { throw new Error(`Not a git repository: ${cwd}`); }

  let complete = true;
  try {
    if (git(['rev-parse', '--is-shallow-repository'], cwd) === 'true') {
      complete = false;
      warnings.push('Shallow clone. Only part of the history is present, so the contributor list is incomplete. Use fetch-depth: 0 in CI.');
    }
  } catch { /* older git */ }

  const args = ['log', '--use-mailmap', `--pretty=format:${RS}%H${FS}%an${FS}%ae${FS}%aI${FS}%B`];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.maxCommits) args.push(`--max-count=${opts.maxCommits}`);
  const raw = git(args, cwd);

  const contributors = new Map<string, Contributor>();
  let commitCount = 0;
  let coAuthored = 0;

  const bump = (name: string, email: string, date: string, viaTrailer: boolean) => {
    email = email.toLowerCase().trim();
    if (!email) return;
    let c = contributors.get(email);
    if (!c) {
      c = { name: name.trim(), email, domain: email.split('@')[1] ?? '', commits: 0,
            coAuthoredOnly: viaTrailer, first: date, last: date,
            status: 'on-domain', note: '' };
      contributors.set(email, c);
    }
    c.commits++;
    if (!viaTrailer) c.coAuthoredOnly = false;
    if (date < c.first) c.first = date;
    if (date > c.last) c.last = date;
  };

  for (const rec of raw.split(RS)) {
    if (!rec.trim()) continue;
    const [, name, email, date, body = ''] = rec.split(FS);
    commitCount++;
    bump(name, email, date, false);
    for (const m of body.matchAll(/^\s*Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim)) {
      bump(m[1], m[2], date, true);
      coAuthored++;
    }
  }

  if (coAuthored) warnings.push(`${coAuthored} Co-authored-by trailers found. Those identities are counted as contributors.`);
  return { contributors, commitCount, complete, warnings };
}
