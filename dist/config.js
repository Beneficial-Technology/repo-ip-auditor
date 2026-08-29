import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const NAMES = ['ipaudit.config.json', '.ipauditrc.json'];
export function loadConfig(root) {
    for (const n of NAMES) {
        const p = join(root, n);
        if (existsSync(p)) {
            try {
                return JSON.parse(readFileSync(p, 'utf8'));
            }
            catch (e) {
                throw new Error(`${n} is not valid JSON`);
            }
        }
    }
    return {};
}
