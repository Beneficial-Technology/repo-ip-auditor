import type { HeaderFinding } from './headers.js';

export type LicenseClass =
  | 'agpl' | 'source-available' | 'gpl' | 'lgpl' | 'weak'
  | 'permissive' | 'proprietary' | 'unknown';

export type ContributorStatus =
  | 'on-domain' | 'unassigned-consumer' | 'third-party-domain'
  | 'identity-masked' | 'automation' | 'allowlisted';

export interface Contributor {
  name: string;
  email: string;
  domain: string;
  commits: number;
  coAuthoredOnly: boolean;
  first: string;
  last: string;
  status: ContributorStatus;
  note: string;
}

export interface Dependency {
  name: string;
  ecosystem: 'npm' | 'pypi' | 'go' | 'cargo' | 'packagist' | 'rubygems';
  license: string | null;
  cls: LicenseClass;
  scope: 'runtime' | 'dev';
  direct: boolean;
  source: string;
}

export type ScanDepth = 'surface' | 'deep';

export interface Deduction { label: string; points: number }

export interface AuditReport {
  repo: string;
  generated: string;
  score: number;
  grade: string;
  commitsScanned: number;
  historyComplete: boolean;
  warnings: string[];
  companyDomains: string[];
  inferredDomain: boolean;
  rootLicense: string | null;
  rootLicenseClass: LicenseClass;
  contributors: Contributor[];
  dependencies: { total: number; resolved: number; flagged: Dependency[] };
  scanDepth: ScanDepth;
  headers: { findings: HeaderFinding[]; filesScanned: number };
  deductions: Deduction[];
}
