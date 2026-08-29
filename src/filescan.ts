import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './git.js';
import { scanFileHead, companyTermsFrom, SOURCE_EXTENSIONS, type HeaderFinding } from './headers.js';

const HEAD_BYTES = 6144;      // license headers live at the top of a file
const MAX_FILES = 20000;
const LICENSE_FILE = /^(LICENSE|LICENCE|COPYING|NOTICE)(\.[A-Za-z]+)?$/i;

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
export function scanFileHeaders(opts: FileScanOptions): FileScanResult {
  let tracked: string[];
  try {
    tracked = git(['ls-files', '-z'], opts.cwd).split('\0').filter(Boolean);
  } catch {
    return { findings: [], filesScanned: 0, truncated: false };
  }

  const candidates = tracked.filter(p => {
    const base = p.split('/').pop() ?? p;
    if (LICENSE_FILE.test(base)) return true;
    const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
    return SOURCE_EXTENSIONS.has(ext);
  });

  const truncated = candidates.length > MAX_FILES;
  const list = truncated ? candidates.slice(0, MAX_FILES) : candidates;
  const scanOpts = {
    companyTerms: companyTermsFrom(opts.domains, opts.company),
    allowCopyright: opts.allowCopyright ?? [],
  };

  const findings: HeaderFinding[] = [];
  let filesScanned = 0;

  for (const rel of list) {
    const abs = join(opts.cwd, rel);
    let head: string;
    try {
      if (statSync(abs).size === 0) continue;
      head = readFileSync(abs, 'utf8').slice(0, HEAD_BYTES);
    } catch { continue; }
    if (head.includes('\u0000')) continue;                       // binary
    filesScanned++;
    findings.push(...scanFileHead(rel, head, scanOpts));
  }

  return { findings, filesScanned, truncated };
}
