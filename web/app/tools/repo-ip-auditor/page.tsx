'use client';

import { useState } from 'react';
import {
  type AuditReport, type ContributorStatus,
  LICENSE_LABEL, STATUS_LABEL, RUBRIC, verdict, markdown,
} from '@beneficialtechnology/repo-ip-auditor/core';
import { scanRepository } from '@/lib/ip-audit/scan-github';
import { sampleReport } from '@/lib/ip-audit/sample';

type Tab = 'findings' | 'contributors' | 'dependencies';

const STATUS_STYLE: Record<ContributorStatus, string> = {
  'on-domain': 'border-emerald-800 bg-emerald-950 text-emerald-300',
  'allowlisted': 'border-emerald-800 bg-emerald-950 text-emerald-300',
  'automation': 'border-slate-700 bg-slate-800 text-slate-300',
  'identity-masked': 'border-amber-800 bg-amber-950 text-amber-300',
  'unassigned-consumer': 'border-rose-800 bg-rose-950 text-rose-300',
  'third-party-domain': 'border-rose-800 bg-rose-950 text-rose-300',
};

const GRADE_STYLE = (g: string) =>
  g === 'A' ? 'border-emerald-700 bg-emerald-950 text-emerald-400'
  : g === 'B' ? 'border-teal-700 bg-teal-950 text-teal-300'
  : g === 'C' ? 'border-amber-700 bg-amber-950 text-amber-400'
  : 'border-rose-700 bg-rose-950 text-rose-400';

const CLI_COMMAND = 'npx @beneficialtechnology/repo-ip-auditor . --domains acme.com';
const ACTION_SNIPPET = 'uses: Beneficial-Technology/repo-ip-auditor@v0';

export default function RepoIPAuditorPage() {
  const [repoInput, setRepoInput] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [tab, setTab] = useState<Tab>('findings');

  async function runAudit() {
    if (!repoInput.trim() || busy) return;
    setBusy(true); setError(''); setReport(null); setIsSample(false);
    try {
      const result = await scanRepository({
        repo: repoInput,
        domains: domainInput.split(',').map(s => s.trim()).filter(Boolean),
        token: tokenInput.trim() || undefined,
        onProgress: setStatus,
      });
      setReport(result); setTab('findings');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Audit failed.');
    } finally {
      setBusy(false); setStatus('');
    }
  }

  function runSample() {
    setError(''); setReport(sampleReport()); setIsSample(true); setTab('findings');
  }

  function download() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ip-audit-${report.repo.replace('/', '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const unassigned = report?.contributors.filter(
    c => c.status === 'unassigned-consumer' || c.status === 'third-party-domain') ?? [];
  const masked = report?.contributors.filter(c => c.status === 'identity-masked') ?? [];
  const strong = report?.dependencies.flagged.filter(
    d => d.scope === 'runtime' && (d.cls === 'agpl' || d.cls === 'source-available' || d.cls === 'gpl')) ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 font-mono text-xs">
          <span className="uppercase tracking-[0.18em] text-amber-500">
            Beneficial Technology <span className="text-slate-600">·</span>{' '}
            <span className="text-slate-400">Legal Engineering</span>
          </span>
          <a href="https://beneficial.technology" className="text-slate-400 transition hover:text-amber-400">
            beneficial.technology
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-4xl font-normal tracking-tight text-white sm:text-5xl">
          Repo IP Auditor
        </h1>
        <p className="mt-2 font-serif text-2xl italic text-amber-500">chain of title, in 30 seconds</p>
        <p className="mt-5 max-w-2xl leading-relaxed text-slate-300">
          Audit a repository&rsquo;s commit history, root license, and package manifests. Flag unassigned
          contributor commits and copyleft obligations before an investor&rsquo;s counsel finds them. Runs
          entirely in your browser. Nothing is uploaded, stored, or logged.
        </p>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <label htmlFor="repo" className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Repository
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="repo" value={repoInput} spellCheck={false} autoComplete="off"
              onChange={e => setRepoInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runAudit(); }}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={runAudit} disabled={busy}
              className="whitespace-nowrap rounded-lg bg-amber-500 px-6 py-2.5 font-mono text-sm font-semibold uppercase tracking-wide text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Auditing' : 'Run audit'}
            </button>
          </div>

          <button
            onClick={runSample} type="button"
            className="mt-3 font-mono text-xs text-teal-400 underline decoration-slate-700 underline-offset-4 transition hover:text-teal-300"
          >
            See a sample report (no scan, no network calls)
          </button>

          <details className="group mt-4 border-t border-slate-800 pt-3">
            <summary className="cursor-pointer select-none font-mono text-xs text-slate-400 hover:text-slate-200">
              Options
            </summary>
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              <div>
                <label htmlFor="domains" className="mb-1 block font-mono text-xs text-slate-300">Company email domains</label>
                <input
                  id="domains" value={domainInput} spellCheck={false} autoComplete="off"
                  onChange={e => setDomainInput(e.target.value)} placeholder="acme.com, acme-labs.io"
                  className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Leave blank and the auditor infers the domain from the dominant non-consumer email in the history. Subdomains of a declared domain count as on-domain.
                </p>
              </div>
              <div>
                <label htmlFor="token" className="mb-1 block font-mono text-xs text-slate-300">GitHub token</label>
                <input
                  id="token" type="password" value={tokenInput} autoComplete="off"
                  onChange={e => setTokenInput(e.target.value)} placeholder="ghp_…"
                  className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Optional. Held in this tab only, never persisted or sent anywhere but GitHub. Raises the limit from 60 calls an hour to 5,000 and reaches private repositories.
                </p>
              </div>
            </div>
          </details>

          {busy && (
            <div className="mt-4 flex items-center gap-3 border-t border-slate-800 pt-4 font-mono text-xs text-amber-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <span>{status}</span>
            </div>
          )}
          {error && (
            <p className="mt-4 border-l-2 border-rose-500 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p>
          )}
        </div>

        {!report && (
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-2">
            {[
              ['Chain of title', 'Every commit author identity in the history, grouped by email domain, with the ones that have no assignment evidence separated out. It reads domains, not signed agreements.'],
              ['Copyleft obligations', 'Declared dependencies from npm, PyPI, Go, Cargo, Composer and Bundler manifests, resolved against public registries and classified from AGPL down to permissive.'],
              ['Root license clarity', 'Whether the repository declares a license, and whether that license is itself copyleft. File-level header scanning runs in the CLI, which reads every tracked source file.'],
              ['Export', 'A score against a published rubric, a remediation list, and markdown, JSON and print output for a diligence folder.'],
            ].map(([title, body]) => (
              <div key={title} className="bg-slate-900 p-5">
                <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-500">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        )}

        {report && (
          <div className="mt-10 space-y-6">
            {isSample && (
              <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-4 py-2.5 font-mono text-xs text-amber-200">
                Sample report. No repository was scanned. Every name and package below is fictional and exists to show the output shape.
              </p>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-mono text-xl font-semibold text-white">{report.repo}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {report.commitsScanned} commits · {report.scanDepth} scan · root license {report.rootLicense ?? 'none'} · domains{' '}
                    <span className="text-amber-400">{report.companyDomains.join(', ') || 'none'}</span>
                    {report.inferredDomain && ' (inferred)'}
                  </p>
                </div>
                <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-950 px-5 py-3">
                  <div className="text-right">
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">Score</div>
                    <div className="font-mono text-2xl font-bold text-white">
                      {report.score}<span className="text-sm text-slate-500">/100</span>
                    </div>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg border font-serif text-3xl ${GRADE_STYLE(report.grade)}`}>
                    {report.grade}
                  </div>
                </div>
              </div>

              <p className="pt-5 text-sm leading-relaxed text-slate-300">{verdict(report)}</p>

              {report.deductions.length > 0 && (
                <ul className="mt-5 space-y-1.5 border-t border-slate-800 pt-5">
                  {report.deductions.map(d => (
                    <li key={d.label} className="flex justify-between gap-4 text-sm text-slate-300">
                      <span>{d.label}</span>
                      <span className="font-mono text-rose-400">-{d.points}</span>
                    </li>
                  ))}
                </ul>
              )}

              {report.warnings.length > 0 && (
                <ul className="mt-5 space-y-1 border-t border-slate-800 pt-5 font-mono text-xs text-slate-500">
                  {report.warnings.map(w => <li key={w}>! {w}</li>)}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-800 pt-5">
                <button onClick={() => navigator.clipboard.writeText(markdown(report))}
                  className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 transition hover:border-slate-500 hover:text-white">
                  Copy markdown
                </button>
                <button onClick={download}
                  className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 transition hover:border-slate-500 hover:text-white">
                  Download JSON
                </button>
                <button onClick={() => window.print()}
                  className="rounded border border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-300 transition hover:border-slate-500 hover:text-white">
                  Print or save PDF
                </button>
              </div>
            </div>

            <div className="flex border-b border-slate-800 font-mono text-xs">
              {([['findings', `Fix first (${unassigned.length + strong.length})`],
                 ['contributors', `Contributors (${report.contributors.length})`],
                 ['dependencies', `Dependencies (${report.dependencies.total})`]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`border-b-2 px-4 py-2.5 transition ${tab === id ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'findings' && (
              <ol className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm leading-relaxed text-slate-300">
                {unassigned.length > 0 && (
                  <li>
                    Get a signed IP assignment from {unassigned.length} contributor{unassigned.length === 1 ? '' : 's'}, starting with{' '}
                    <code className="font-mono text-xs text-amber-400">{unassigned.slice(0, 3).map(c => c.email).join(', ')}</code>.
                    Retroactive assignments get harder every month after someone stops contributing.
                  </li>
                )}
                {masked.length > 0 && (
                  <li>
                    Map {masked.length} masked GitHub identit{masked.length === 1 ? 'y' : 'ies'} to real people and confirm each is
                    covered by an employment agreement, contractor agreement, or CLA. The commit log cannot tell you who they are.
                  </li>
                )}
                {strong.length > 0 && (
                  <li>
                    Resolve {strong.length} strong copyleft runtime dependenc{strong.length === 1 ? 'y' : 'ies'} (
                    {strong.map(d => d.name).join(', ')}). AGPL obligations trigger on network use without distribution, and how you
                    link a GPL library changes the answer.
                  </li>
                )}
                {!report.rootLicense && <li>Add a root LICENSE file. An unlicensed repository is ambiguous to everyone reading it, including your acquirer.</li>}
                {unassigned.length + masked.length + strong.length === 0 && report.rootLicense && (
                  <li>Nothing flagged in this history. Re-run it in CI so the next contractor commit does not slip through.</li>
                )}
                <li>Store the result. Diligence asks for the history, not just today&rsquo;s snapshot.</li>
              </ol>
            )}

            {tab === 'contributors' && (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                    <tr><th className="p-3">Identity</th><th className="p-3">Domain</th><th className="p-3">Commits</th><th className="p-3">Active</th><th className="p-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {report.contributors.map(c => (
                      <tr key={c.email} className="transition hover:bg-slate-800/40">
                        <td className="p-3">
                          <div className="text-white">{c.name}</div>
                          <div className="text-slate-500">{c.email}</div>
                        </td>
                        <td className="p-3 text-slate-400">{c.domain || '—'}</td>
                        <td className="p-3 text-slate-400">{c.commits}</td>
                        <td className="p-3 text-slate-500">{c.first.slice(0, 7)} to {c.last.slice(0, 7)}</td>
                        <td className="p-3">
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${STATUS_STYLE[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'dependencies' && (
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
                {report.dependencies.flagged.length === 0 ? (
                  <p className="p-6 text-sm text-slate-400">
                    No copyleft obligations in the declared dependency set. {report.dependencies.resolved} of{' '}
                    {report.dependencies.total} licenses resolved. This reads declared licenses only, not vendored code,
                    transitive packages, or how each one is linked.
                  </p>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                      <tr><th className="p-3">Package</th><th className="p-3">Ecosystem</th><th className="p-3">Declared</th><th className="p-3">Scope</th><th className="p-3">Class</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {report.dependencies.flagged.map(d => (
                        <tr key={`${d.ecosystem}:${d.name}`} className="transition hover:bg-slate-800/40">
                          <td className="p-3 text-white">{d.name}</td>
                          <td className="p-3 uppercase text-slate-400">{d.ecosystem}</td>
                          <td className="p-3 text-slate-300">{d.license ?? '—'}</td>
                          <td className="p-3 text-slate-400">{d.scope}{d.direct ? '' : ', transitive'}</td>
                          <td className="p-3">
                            <span className={`rounded border px-2 py-0.5 text-[10px] ${
                              d.cls === 'agpl' || d.cls === 'gpl' || d.cls === 'source-available'
                                ? 'border-rose-800 bg-rose-950 text-rose-300'
                                : 'border-amber-800 bg-amber-950 text-amber-300'}`}>
                              {LICENSE_LABEL[d.cls]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <details className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.14em] text-slate-400">Scoring rubric</summary>
              <table className="mt-4 w-full text-left font-mono text-xs">
                <thead className="text-slate-500"><tr><th className="py-2">Finding</th><th className="py-2">Per item</th><th className="py-2">Cap</th></tr></thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {RUBRIC.map(r => (
                    <tr key={r.id}><td className="py-2">{r.label}</td><td className="py-2 text-rose-400">-{r.per}</td><td className="py-2 text-slate-500">{r.cap}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                Grades: A 90+, B 75+, C 60+, D 40+, F below 40. The same function scores the CLI, the Action, and this page.
              </p>
            </details>
          </div>
        )}

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {[['Private repos and full history', 'The browser reads at most 500 commits and cannot open file headers. The CLI reads local git, scans every tracked source file for copyleft headers and third-party copyright notices, resolves .mailmap identities, picks up Co-authored-by trailers, walks installed dependency trees, and runs offline.', CLI_COMMAND],
            ['Continuous check', 'Post the report to every pull request and fail the build below a score you set. Requires fetch-depth: 0 on checkout, or the history is incomplete.', ACTION_SNIPPET]].map(([title, body, snippet]) => (
            <div key={title} className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div>
                <h4 className="mb-1.5 text-sm font-semibold text-white">{title}</h4>
                <p className="mb-4 text-sm leading-relaxed text-slate-400">{body}</p>
              </div>
              <div className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950 p-2.5">
                <code className="overflow-x-auto font-mono text-[11px] text-slate-300">{snippet}</code>
                <button onClick={() => navigator.clipboard.writeText(snippet)}
                  className="shrink-0 font-mono text-[10px] text-teal-400 transition hover:text-teal-300">Copy</button>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-12 border-t border-slate-800 pt-8 text-xs leading-relaxed text-slate-500">
          <p>
            This tool produces an engineering signal, not a legal opinion. It reads commit metadata and declared dependency
            licenses. It cannot see signed agreements, employment records, contribution license agreements, or how a dependency
            is actually linked, and those facts change the answer. No attorney-client relationship is created by running an audit.
          </p>
          <p className="mt-3 flex justify-between border-t border-slate-900 pt-3">
            <span>Built by Beneficial Technology.</span>
            <span className="text-slate-400">Source stays on your machine.</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
