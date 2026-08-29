import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface FileConfig {
  domains?: string[];
  allowContributors?: string[];
  allowPackages?: string[];
  company?: string;
  allowCopyright?: string[];
  minScore?: number;
  offline?: boolean;
}

const NAMES = ['ipaudit.config.json', '.ipauditrc.json'];

export function loadConfig(root: string): FileConfig {
  for (const n of NAMES) {
    const p = join(root, n);
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf8')); }
      catch (e) { throw new Error(`${n} is not valid JSON`); }
    }
  }
  return {};
}
