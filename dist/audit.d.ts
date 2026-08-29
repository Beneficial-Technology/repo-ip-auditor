import type { AuditReport } from './types.js';
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
export declare function audit(opts: AuditOptions): Promise<AuditReport>;
