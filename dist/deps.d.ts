import type { Dependency } from './types.js';
export declare function findManifests(root: string, max?: number): string[];
export declare function parseManifest(path: string, text: string, root: string): Dependency[];
/** Installed packages are the truth. If node_modules or a site-packages tree is
 *  present we read licenses off disk, which also covers transitive dependencies
 *  that no manifest lists. */
export declare function readInstalledLicenses(root: string): Map<string, {
    license: string;
    ecosystem: Dependency['ecosystem'];
}>;
export declare function resolveLicenses(deps: Dependency[], root: string, offline: boolean): Promise<Dependency[]>;
