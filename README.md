# Repo IP Auditor

Audits a git repository for IP chain-of-title gaps and copyleft exposure. Reads commit history, root license, and package manifests, then scores the result against a published rubric.

Built by [Beneficial Technology](https://beneficial.technology). MIT licensed. Zero runtime dependencies, which felt like the minimum standard for a tool that audits your dependencies.

## Why the CLI exists

The browser version reads public repos through the GitHub API. It sees at most 500 commits, cannot open private repositories, and misses the identities that matter most.

The CLI reads local git. That means:

- Full history, not a page-limited slice
- Private repos, where the contractor commits actually live
- `.mailmap` identity resolution
- `Co-authored-by` trailers, which is where squash-merged contributor identities survive
- Installed dependency trees, so transitive licenses get resolved instead of guessed
- File headers on every tracked source file, which is where copied third-party code actually shows up
- Offline operation, so nothing about your codebase leaves the machine

## The deep scan

`git ls-files` is the file list. Uncommitted build output is not a chain-of-title problem; vendored third-party code that was committed is exactly the problem. Each tracked source file has its first 6 KB read, because license headers live at the top.

Four findings come out of it:

- **Copyleft SPDX header.** `SPDX-License-Identifier: GPL-3.0` on a file inside your repository. Stronger evidence than a manifest entry, because the code is already in your tree.
- **Copyleft license text.** GPL, LGPL, AGPL, MPL or EPL preamble pasted into a source file.
- **Vendored copyleft license.** A `LICENSE` or `COPYING` file in a subdirectory. At the root it is your license; in `vendor/` it is someone else's.
- **Third-party copyright holder.** A copyright line naming an entity that is not you. Pass `--company "Acme, Inc."` and declare your domains so your own notices are recognised, and use `allowCopyright` in config for holders you have already cleared.

Two rules keep it honest. If the repository's own root license is copyleft, copyleft headers are reported but not deducted, because a GPL project is not contaminated by GPL headers. And permissive license boilerplate is filtered out of copyright matching, so BSD disclaimer text does not get reported as a rights holder.

Skip it with `--no-headers` for a surface scan that matches what the browser can see.

## Install

```bash
npm i -g @beneficialtechnology/repo-ip-auditor
repo-ip-audit .
```

Or run it once without installing:

```bash
npx @beneficialtechnology/repo-ip-auditor .
```

Requires Node 20 or later and git on the path.

## Usage

```
repo-ip-audit [path] [options]

  --domains a.com,b.com   Company email domains. Inferred from history if omitted.
  --min-score 75          Exit 1 when the score falls below this.
  --format text|json|md   Output format. Default: text.
  --out FILE              Write the report to a file.
  --offline               Skip registry lookups. Reads licenses from disk only.
  --no-headers            Skip the file header scan (surface scan only).
  --company "Acme, Inc."  Copyright holder to treat as your own.
  --since 2023-01-01      Limit history by date.
  --max-commits 5000      Limit history by count.
  --rubric                Print the scoring rubric and exit.
```

Exit codes: `0` pass, `1` below threshold, `2` error.

## Configuration

`ipaudit.config.json` in the repo root:

```json
{
  "domains": ["acme.com", "acmelabs.io"],
  "company": "Acme, Inc.",
  "allowContributors": ["ex-contractor@gmail.com"],
  "allowPackages": ["npm:some-lgpl-tool"],
  "allowCopyright": ["Acme Holdings LLC"],
  "minScore": 80
}
```

`allowContributors` is for identities whose assignment you have already papered. `allowPackages` is for copyleft you have reviewed and accepted. Both are the record of a decision, so keep them in version control and put a reason in the commit message.

## GitHub Action

```yaml
name: IP audit
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # required, or history is incomplete
      - uses: Beneficial-Technology/repo-ip-auditor@v0
        with:
          domains: acme.com
          company: Acme, Inc.
          min-score: '75'
```

`fetch-depth: 0` is not optional. The default shallow clone hides most of the history, and a shallow scan produces a clean score for the wrong reason. The action emits a warning when it detects one.

Outputs: `score`, `grade`, `unassigned`, `copyleft`, `report`.

Findings are written to the job summary and emitted as annotations. To comment on the pull request instead:

```yaml
      - uses: Beneficial-Technology/repo-ip-auditor@v0
        id: ip
        with: { domains: acme.com }
      - uses: peter-evans/create-or-update-comment@v4
        with:
          issue-number: ${{ github.event.pull_request.number }}
          body: ${{ steps.ip.outputs.report }}
```

Start with `min-score: '0'` and let it report for a few weeks. Turning the gate on before the backlog is cleared just teaches the team to skip the check.

## Scoring

Fixed deductions from a base of 100. Same rubric as the browser version, so the two agree.

| Finding | Per item | Cap |
|---|---|---|
| Unassigned contributor, consumer email domain | -6 | 30 |
| Unassigned contributor, other corporate domain | -9 | 30 |
| AGPL or source-available runtime dependency | -25 | 45 shared with GPL |
| GPL runtime dependency | -15 | 45 shared with AGPL |
| LGPL, MPL or EPL runtime dependency | -4 | 12 |
| Copyleft in dev dependencies only | -2 | 6 |
| No root LICENSE file | -10 | once |
| Root license is itself copyleft | -20 | once |
| Committed source file under a copyleft header (deep scan) | -12 | 36 |
| Vendored copyleft license file (deep scan) | -8 | 24 |
| Third-party copyright holder in source (deep scan) | -5 | 20 |

Grades: A 90+, B 75+, C 60+, D 40+, F below 40.

Dev dependencies are scored separately from runtime because a GPL build tool is not a distribution problem. Anything the classifier cannot map lands in `unresolved` and is reported rather than assumed permissive.

## What it cannot tell you

- Whether an agreement exists. It reads email domains, not signatures. An on-domain commit from someone who never signed an assignment scores as clean.
- How a dependency is linked. Static linking, dynamic linking, and a separate process are three different answers, and the manifest does not say which one you have.
- Whether a license file matches the license field. It reports what is declared.
- Whether a copyright notice is accurate. It reads the text, not the ownership record.
- Anything about squash-merged history beyond the trailers. If your history was rewritten, original authorship is gone and a clean score means less than it looks like.

This is an engineering signal, not a legal opinion. No attorney-client relationship is created by running it.
