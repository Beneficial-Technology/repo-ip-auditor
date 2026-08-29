import { classifyLicense } from './licenses.js';
export const HEADER_KIND_SHORT = {
    'spdx-copyleft': 'SPDX copyleft',
    'license-text': 'License text',
    'vendored-license': 'Vendored license',
    'foreign-copyright': 'Third-party (c)',
};
export const HEADER_KIND_LABEL = {
    'spdx-copyleft': 'Copyleft SPDX header',
    'license-text': 'Copyleft license text in source',
    'vendored-license': 'Vendored copyleft license file',
    'foreign-copyright': 'Third-party copyright holder',
};
export const SOURCE_EXTENSIONS = new Set([
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'c', 'h', 'cc', 'cpp', 'hpp', 'cxx',
    'cs', 'rb', 'php', 'swift', 'm', 'mm', 'sh', 'bash', 'sql', 'sol', 'vue', 'svelte', 'dart', 'ex', 'exs', 'erl', 'hs', 'lua', 'pl', 'r', 'jl', 'zig',
]);
/** Files that carry a full license text on purpose. Scanning them for license
 *  text produces a finding about the repository's own license, not a leak. */
const LICENSE_FILENAME = /^(LICENSE|LICENCE|COPYING|NOTICE)(\.[A-Za-z]+)?$/i;
const SPDX = /SPDX-License-Identifier:\s*([A-Za-z0-9.+\-() ]+)/;
const LICENSE_TEXT = [
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
// Deliberately case-sensitive. With the /i flag the [A-Z] anchor stops doing
// any work, and ordinary prose containing the word "copyright" gets captured
// as a rights holder.
const COPYRIGHT = /(?:^|\s)(?:©|\(c\)|\(C\)|Copyright|COPYRIGHT)(?:\s*\((?:c|C)\))?\s*(?:©\s*)?(?:\d{4}(?:\s*[-–,]\s*\d{4})*\s*[, ]*)?(?:by\s+)?([A-Z][^\n\r*/#;]{2,60})/g;
/** Holders that say nothing about provenance. */
const NOISE = /^(the\s+)?(author|authors|contributors|copyright holders?|owner|respective owners|all rights reserved|and contributors|holders?|notice|redistribution|disclaimer|permission|this|above|year|name of)\b/i;
/** Fragments of permissive license boilerplate that the copyright pattern can
 *  otherwise capture as if they were a holder. */
const BOILERPLATE = /(holders?\s+and\s+contributors|as\s+is|list of conditions|following disclaimer|warrant|no event shall|provided by)/i;
/** License headers are comments. Requiring the match to sit on a commented
 *  line is what stops a scanner from flagging its own license-detection
 *  tables, and stops any file that merely discusses licensing from being
 *  reported as carrying that license. */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#|--|;|<!--|%)/;
function onCommentLine(text, index) {
    const start = text.lastIndexOf('\n', index) + 1;
    return COMMENT_LINE.test(text.slice(start, index + 1));
}
function cleanHolder(raw) {
    return raw
        .replace(/\ball rights reserved\b.*$/i, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s*\.\s*$/, '')
        .replace(/[,;]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/** Pure. Reads the head of one file and reports what its header claims.
 *  Only the first part of a file is examined: license headers live at the top,
 *  and reading whole files turns a fast scan into a slow one. */
export function scanFileHead(path, head, opts) {
    const findings = [];
    const base = path.split('/').pop() ?? path;
    const isLicenseFile = LICENSE_FILENAME.test(base);
    const atRoot = !path.includes('/');
    const lineOf = (index) => head.slice(0, index).split('\n').length;
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
    if (spdx && onCommentLine(head, spdx.index)) {
        const cls = classifyLicense(spdx[1]);
        if (cls === 'agpl' || cls === 'gpl' || cls === 'lgpl' || cls === 'weak' || cls === 'source-available') {
            findings.push({ path, line: lineOf(spdx.index), kind: 'spdx-copyleft', detail: spdx[1].trim(), cls });
        }
    }
    if (!findings.some(f => f.kind === 'spdx-copyleft')) {
        for (const [re, label] of LICENSE_TEXT) {
            const m = re.exec(head);
            if (!m || !onCommentLine(head, m.index))
                continue;
            const cls = classifyLicense(label);
            if (cls === 'permissive' || cls === 'unknown')
                continue;
            findings.push({ path, line: lineOf(m.index), kind: 'license-text', detail: label, cls });
            break;
        }
    }
    const allow = (opts.allowCopyright ?? []).map(s => s.toLowerCase());
    const seen = new Set();
    COPYRIGHT.lastIndex = 0;
    let c;
    while ((c = COPYRIGHT.exec(head))) {
        if (!onCommentLine(head, c.index))
            continue;
        const holder = cleanHolder(c[1]);
        const lower = holder.toLowerCase();
        if (!holder || holder.length < 3 || NOISE.test(lower) || BOILERPLATE.test(lower) || seen.has(lower))
            continue;
        seen.add(lower);
        if (opts.companyTerms.some(t => t && lower.includes(t)))
            continue;
        if (allow.some(a => lower.includes(a)))
            continue;
        findings.push({ path, line: lineOf(c.index), kind: 'foreign-copyright', detail: holder, cls: 'unknown' });
    }
    return findings;
}
function matchLicenseText(text) {
    for (const [re, label] of LICENSE_TEXT)
        if (re.test(text))
            return label;
    return null;
}
/** Company terms derived from declared domains: acme-labs.com becomes acme-labs. */
export function companyTermsFrom(domains, company) {
    const terms = domains.map(d => d.split('.')[0].toLowerCase()).filter(t => t.length > 2);
    if (company)
        terms.push(...company.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2 && !/^(inc|llc|ltd|corp|co|gmbh|plc|sa|bv|the)\.?$/.test(w)));
    return [...new Set(terms)];
}
