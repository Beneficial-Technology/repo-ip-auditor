/** Classify a declared license string. Deliberately conservative: anything we
 *  cannot map lands in `unknown` rather than being assumed permissive. */
export function classifyLicense(raw) {
    const s = String(raw ?? '').toUpperCase().trim();
    if (!s || s === 'UNKNOWN' || s === 'NULL' || s === 'NOASSERTION')
        return 'unknown';
    if (/AGPL|AFFERO/.test(s))
        return 'agpl';
    if (/SSPL|COMMONS.?CLAUSE|BUSL|BUSINESS SOURCE|ELASTIC LICENSE|POLYFORM|FSL-/.test(s))
        return 'source-available';
    if (/LGPL|LESSER GENERAL PUBLIC/.test(s))
        return 'lgpl';
    if (/\bGPL|GENERAL PUBLIC LICENSE/.test(s))
        return 'gpl';
    if (/MPL|MOZILLA PUBLIC|\bEPL\b|ECLIPSE PUBLIC|CDDL|EUPL|\bOSL\b|CC-BY-SA/.test(s))
        return 'weak';
    if (/PROPRIETARY|UNLICENSED|SEE LICENSE|COMMERCIAL/.test(s))
        return 'proprietary';
    if (/\bMIT\b|APACHE|BSD|\bISC\b|UNLICENSE|CC0|ZLIB|PYTHON SOFTWARE|\bPSF\b|WTFPL|BSL-1\.0|BOOST|BLUEOAK|0BSD/.test(s))
        return 'permissive';
    return 'unknown';
}
export const LICENSE_LABEL = {
    agpl: 'AGPL', 'source-available': 'Source-available', gpl: 'GPL', lgpl: 'LGPL',
    weak: 'Weak copyleft', permissive: 'Permissive', proprietary: 'Proprietary', unknown: 'Unresolved',
};
export const COPYLEFT = ['agpl', 'source-available', 'gpl', 'lgpl', 'weak'];
export const STRONG_COPYLEFT = ['agpl', 'source-available'];
