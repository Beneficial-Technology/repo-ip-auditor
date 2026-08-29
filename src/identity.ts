import type { Contributor, ContributorStatus } from './types.js';

/** Pure identity logic. No node imports, so the browser build imports the same
 *  file the CLI does and the two cannot drift. */

export const FREEMAIL = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','me.com','protonmail.com','proton.me','pm.me','aol.com','live.com','msn.com','gmx.com','gmx.de','mail.com','yandex.ru','qq.com','163.com','126.com','hey.com','fastmail.com','duck.com','zoho.com','tutanota.com','web.de','naver.com','hotmail.co.uk','googlemail.com']);

export const BOT = /\[bot\]|dependabot|renovate|github-actions|semantic-release|greenkeeper|snyk-bot|imgbot|allcontributors|copybara|noreply@google/i;

export const isBot = (email: string, name = '', login = '') =>
  BOT.test(email) || BOT.test(name) || BOT.test(login);

export const STATUS_LABEL: Record<ContributorStatus, string> = {
  'on-domain': 'On-domain',
  'allowlisted': 'Allowlisted',
  'automation': 'Automation',
  'identity-masked': 'Identity masked',
  'unassigned-consumer': 'Unassigned',
  'third-party-domain': 'Third party',
};

export const STATUS_NOTE: Record<ContributorStatus, string> = {
  'on-domain': 'Presumed employee or founder',
  'allowlisted': 'Assignment confirmed in config',
  'automation': 'Machine account, no assignment needed',
  'identity-masked': 'GitHub privacy email, real identity is not in the log',
  'unassigned-consumer': 'Consumer email, no assignment evidence in history',
  'third-party-domain': 'Commits from an outside organization domain',
};

/** Domains match exactly or as a subdomain of a declared company domain. */
export function statusFor(
  email: string, name: string, domains: string[], allow: Set<string>, login = '',
): ContributorStatus {
  if (allow.has(email)) return 'allowlisted';
  if (isBot(email, name, login)) return 'automation';
  const domain = email.split('@')[1] ?? '';
  if (domains.some(d => domain === d || domain.endsWith('.' + d))) return 'on-domain';
  if (domain.endsWith('users.noreply.github.com')) return 'identity-masked';
  if (FREEMAIL.has(domain)) return 'unassigned-consumer';
  return 'third-party-domain';
}

export function classify(contributors: Contributor[], domains: string[], allowEmails: string[]): Contributor[] {
  const allow = new Set(allowEmails.map(e => e.toLowerCase()));
  return contributors
    .map(c => {
      const status = statusFor(c.email, c.name, domains, allow);
      return { ...c, status, note: STATUS_NOTE[status] };
    })
    .sort((a, b) => b.commits - a.commits);
}

/** Dominant non-consumer domain, used when the caller does not declare one. */
export function inferDomain(contributors: Contributor[]): string | null {
  const tally = new Map<string, number>();
  for (const c of contributors) {
    if (!c.domain || FREEMAIL.has(c.domain) || c.domain.endsWith('users.noreply.github.com')) continue;
    if (isBot(c.email, c.name)) continue;
    tally.set(c.domain, (tally.get(c.domain) ?? 0) + c.commits);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
