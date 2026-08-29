import type { LicenseClass } from './types.js';
/** Classify a declared license string. Deliberately conservative: anything we
 *  cannot map lands in `unknown` rather than being assumed permissive. */
export declare function classifyLicense(raw: string | null | undefined): LicenseClass;
export declare const LICENSE_LABEL: Record<LicenseClass, string>;
export declare const COPYLEFT: LicenseClass[];
export declare const STRONG_COPYLEFT: LicenseClass[];
