import type { AuditReport, Contributor, Dependency, Deduction } from './types.js';
import type { HeaderFinding } from './headers.js';
/** Published rubric. Fixed deductions from a base of 100, no hidden weighting.
 *  Must stay identical to the browser build or the two tools disagree. */
export declare const RUBRIC: {
    id: string;
    label: string;
    per: number;
    cap: number;
}[];
export declare function score(input: {
    contributors: Contributor[];
    flagged: Dependency[];
    hasRootLicense: boolean;
    rootLicenseClass: string;
    /** Deep-scan findings. Omit for a surface scan: the browser cannot read file
     *  headers without fetching every file, so it never supplies these. */
    headers?: HeaderFinding[];
}): {
    score: number;
    grade: string;
    deductions: Deduction[];
};
export declare const grade: (n: number) => "A" | "B" | "C" | "D" | "F";
export declare function verdict(r: AuditReport): string;
