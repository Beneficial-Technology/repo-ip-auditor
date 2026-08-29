/** Browser-safe surface of the auditor. The web front end imports this exact
 *  module, so the score shown on the site is the score the CLI and the Action
 *  produce. Anything importing node builtins stays out of this file. */
export * from './types.js';
export * from './licenses.js';
export * from './identity.js';
export * from './headers.js';
export { RUBRIC, score, grade, verdict } from './score.js';
export { markdown } from './markdown.js';
export { parseManifestText, MANIFEST_NAMES } from './manifests.js';
