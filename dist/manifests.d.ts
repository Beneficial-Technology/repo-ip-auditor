import type { Dependency } from './types.js';
export declare const MANIFEST_NAMES: string[];
/** Pure manifest parsing. Shared by the CLI and the browser so both read the
 *  same dependency set out of the same files. */
export declare function parseManifestText(base: string, text: string, src: string): Dependency[];
