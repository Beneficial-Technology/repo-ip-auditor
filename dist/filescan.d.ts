import { type HeaderFinding } from './headers.js';
export interface FileScanOptions {
    cwd: string;
    domains: string[];
    company?: string;
    allowCopyright?: string[];
}
export interface FileScanResult {
    findings: HeaderFinding[];
    filesScanned: number;
    truncated: boolean;
}
/** Walks tracked files only. `git ls-files` is the right list: uncommitted
 *  build output is not a chain-of-title problem, and vendored code that was
 *  committed is exactly the problem. */
export declare function scanFileHeaders(opts: FileScanOptions): FileScanResult;
