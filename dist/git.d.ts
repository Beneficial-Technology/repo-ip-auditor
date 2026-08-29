import type { Contributor } from './types.js';
export { classify, inferDomain, FREEMAIL, isBot } from './identity.js';
export declare function git(args: string[], cwd: string): string;
export interface HistoryOptions {
    cwd: string;
    since?: string;
    maxCommits?: number;
}
export interface History {
    contributors: Map<string, Contributor>;
    commitCount: number;
    complete: boolean;
    warnings: string[];
}
/** Reads the full local history. This is the reason the CLI exists: it sees
 *  private repos, complete history, .mailmap identities, and Co-authored-by
 *  trailers that squash merges leave behind. The web build sees none of that. */
export declare function readHistory(opts: HistoryOptions): History;
