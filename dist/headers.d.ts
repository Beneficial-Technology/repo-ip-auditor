import type { LicenseClass } from './types.js';
export type HeaderKind = 'spdx-copyleft' | 'license-text' | 'vendored-license' | 'foreign-copyright';
export interface HeaderFinding {
    path: string;
    line: number;
    kind: HeaderKind;
    detail: string;
    cls: LicenseClass;
}
export declare const HEADER_KIND_SHORT: Record<HeaderKind, string>;
export declare const HEADER_KIND_LABEL: Record<HeaderKind, string>;
export declare const SOURCE_EXTENSIONS: Set<string>;
export interface HeaderScanOptions {
    /** Lowercase tokens that identify the company: domain roots, company name words. */
    companyTerms: string[];
    /** Holders the user has already reviewed. */
    allowCopyright?: string[];
}
/** Pure. Reads the head of one file and reports what its header claims.
 *  Only the first part of a file is examined: license headers live at the top,
 *  and reading whole files turns a fast scan into a slow one. */
export declare function scanFileHead(path: string, head: string, opts: HeaderScanOptions): HeaderFinding[];
/** Company terms derived from declared domains: acme-labs.com becomes acme-labs. */
export declare function companyTermsFrom(domains: string[], company?: string): string[];
