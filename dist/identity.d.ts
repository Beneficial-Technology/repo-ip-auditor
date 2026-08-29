import type { Contributor, ContributorStatus } from './types.js';
/** Pure identity logic. No node imports, so the browser build imports the same
 *  file the CLI does and the two cannot drift. */
export declare const FREEMAIL: Set<string>;
export declare const BOT: RegExp;
export declare const isBot: (email: string, name?: string, login?: string) => boolean;
export declare const STATUS_LABEL: Record<ContributorStatus, string>;
export declare const STATUS_NOTE: Record<ContributorStatus, string>;
/** Domains match exactly or as a subdomain of a declared company domain. */
export declare function statusFor(email: string, name: string, domains: string[], allow: Set<string>, login?: string): ContributorStatus;
export declare function classify(contributors: Contributor[], domains: string[], allowEmails: string[]): Contributor[];
/** Dominant non-consumer domain, used when the caller does not declare one. */
export declare function inferDomain(contributors: Contributor[]): string | null;
