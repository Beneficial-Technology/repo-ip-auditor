import type { LicenseClass } from './types.js';
import { classifyLicense } from './licenses.js';

export type HeaderKind = 'spdx-copyleft' | 'license-text' | 'vendored-license' | 'foreign-copyright';

export interface HeaderFinding {
  path: string;
  line: number;
  kind: HeaderKind;
  detail: string;
  cls: LicenseClass;
}

export const HEADER_KIND_SHORT: Record<HeaderKind, string> = {
  'spdx-copyleft': 'SPDX copyleft',
  'license-text': 'License text',
  'vendored-license': 'Vendored license',
  'foreign-copyright': 'Third-party (c)',
};

export const HEADER_KIND_LABEL: Record<HeaderKind, string> = {
  'spdx-copyleft': 'Copyleft SPDX header',
  'license-text': 'Copyleft license text in source',
  'vendored-license': 'Vendored copyleft license file',
  'foreign-copyright': 'Third-party copyright holder',
};

export const SOURCE_EXTENSIONS = new Set([
  'js','jsx','mjs','cjs','ts','tsx','py','go','rs','java','kt','kts','scala','c','h','cc','cpp','hpp','cxx',
  'cs','rb','php','swift','m','mm','sh','bash','sql','sol','vue','svelte','dart','ex','exs','erl','hs','lua','pl','r','jl','zig',
]);

/** Files that carry a full license text on purpose. Scanning them for license
 *  text produces a finding about the repository's own license, not a leak. */
const LICENSE_FILENAME = /^(LICENSE|LICENCE|COPYING|NOTICE)(\.[A-Za-z]+)?$/i;

const SPDX = /SPDX-License-Identifier:\s*([A-Za-z0-9.+\-() ]+)/;

const LICENSE_TEXT: Array<[RegExp, string]> = [
  [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL'],
  [/GNU LESSER GENERAL PUBLIC LICENSE/i, 'LGPL'],
  [/GNU GENERAL PUBLIC LICENSE/i, 'GPL'],
  [/under the terms of the GNU Affero/i, 'AGPL'],
  [/under the terms of the GNU Lesser/i, 'LGPL'],
  [/under the terms of the GNU General Public License/i, 'GPL'],
  [/Mozilla Public License(?:,? v(?:ersion)? ?2)?/i, 'MPL-2.0'],
  [/Eclipse Public License/i, 'EPL'],
  [/Server Side Public License/i, 'SSPL'],
];

const COPYRIGHT = /(?:^|\s)(?:©|\(c\)|Copyright(?:\s+\(c\))?)\s*(?:©\s*)?(?:\d{4}(?:\s*[-–,]\s*\d{4})*\s*[, ]*)?(?:by\s+)?([A-Z][^\n\r*/#;]{2,60})/gi;

/** Holders that say nothing about provenance. */
const NOISE = /^(the\s+)?(author|authors|contributors|copyright holders?|owner|respective owners|all rights reserved|and contributors|holders?|notice|redistribution|disclaimer|permission|this|above|year|name of)\b/i;

/** Fragments of permissive license boilerplate that the copyright pattern can
 *  otherwise capture as if they were a holder. */
const BOILERPLATE = /(holders?\s+and\s+contributors|as\s+is|list of conditions|following disclaimer|warrant|no event shall|provided by)/i;

function cleanHolder(raw: string): string {
  return raw
    .replace(/\ball rights reserved\b.*$/i, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s*\.\s*$/, '')
    .replace(/[,;]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HeaderScanOptions {
  /** Lowercase tokens that identify the company: domain roots, company name words. */
  companyTerms: string[];
  /** Holders the user has already reviewed. */
  allowCopyright?: string[];
}

/** Pure. Reads the head of one file and reports what its header claims.
 *  Only the first part of a file is examined: license headers live at the top,
 *  and reading whole files turns a fast scan into a slow one. */
export function scanFileHead(path: string, head: string, opts: HeaderScanOptions): HeaderFinding[] {
  const findings: HeaderFinding[] = [];
  const base = path.split('/').pop() ?? path;
  const isLicenseFile = LICENSE_FILENAME.test(base);
  const atRoot = !path.includes('/');
  const lineOf = (index: number) => head.slice(0, index).split('\n').length;

  if (isLicenseFile) {
    // A license file in a subdirectory is vendored third-party code. At the
    // root it is the repository's own license and is scored elsewhere.
    if (!atRoot) {
      const cls = classifyLicense(matchLicenseText(head) ?? head.slice(0, 400));
      if (cls === 'agpl' || cls === 'gpl' || cls === 'lgpl' || cls === 'weak' || cls === 'source-available') {
        findings.push({ path, line: 1, kind: 'vendored-license', detail: matchLicenseText(head) ?? cls.toUpperCase(), cls });
      }
    }
    return findings;
  }

  const spdx = SPDX.exec(head);
  if (spdx) {
    const cls = classifyLicense(spdx[1]);
    if (cls === 'agpl' || cls === 'gpl' || cls === 'lgpl' || cls === 'weak' || cls === 'source-available') {
      findings.push({ path, line: lineOf(spdx.index), kind: 'spdx-copyleft', detail: spdx[1].trim(), cls });
    }
  }

  if (!findings.some(f => f.kind === 'spdx-copyleft')) {
    for (const [re, label] of LICENSE_TEXT) {
      const m = re.exec(head);
      if (!m) continue;
      const cls = classifyLicense(label);
      if (cls === 'permissive' || cls === 'unknown') continue;
      findings.push({ path, line: lineOf(m.index), kind: 'license-text', detail: label, cls });
      break;
    }
  }

  const allow = (opts.allowCopyright ?? []).map(s => s.toLowerCase());
  const seen = new Set<string>();
  COPYRIGHT.lastIndex = 0;
  let c: RegExpExecArray | null;
  while ((c = COPYRIGHT.exec(head))) {
    const holder = cleanHolder(c[1]);
    const lower = holder.toLowerCase();
    if (!holder || holder.length < 3 || NOISE.test(lower) || BOILERPLATE.test(lower) || seen.has(lower)) continue;
    seen.add(lower);
    if (opts.companyTerms.some(t => t && lower.includes(t))) continue;
    if (allow.some(a => lower.includes(a))) continue;
    findings.push({ path, line: lineOf(c.index), kind: 'foreign-copyright', detail: holder, cls: 'unknown' });
  }

  return findings;
}

function matchLicenseText(text: string): string | null {
  for (const [re, label] of LICENSE_TEXT) if (re.test(text)) return label;
  return null;
}

/** Company terms derived from declared domains: acme-labs.com becomes acme-labs. */
export function companyTermsFrom(domains: string[], company?: string): string[] {
  const terms = domains.map(d => d.split('.')[0].toLowerCase()).filter(t => t.length > 2);
  if (company) terms.push(...company.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2 && !/^(inc|llc|ltd|corp|co|gmbh|plc|sa|bv|the)\.?$/.test(w)));
  return [...new Set(terms)];
}
