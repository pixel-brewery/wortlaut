# Releasing

A release works as in Symphony and Resonanz: a source change pushed to `main` requests one.
Documentation-only pushes skip the release. `dev` is where work happens, and merging a code change
into `main` releases it. Releases belong to the owner.

| Workflow                    | When                                                       | What it does                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                    | Pull requests, the merge queue, pushes to `main` and `dev` | Classifies the complete diff; code changes verify on Linux, macOS and Windows, then exercise the built and packaged app on macOS and Windows |
| `release.yml`               | Code push to `main`, or by hand                            | One release candidate, then the installers and the packages; documentation-only automatic pushes stop before preparation                     |
| `release-rehearsal.yml`     | Changes to the release on `dev`, or by hand                | The same on the real runners, and it publishes nothing                                                                                       |
| `dependabot-auto-merge.yml` | After quality/release completion and hourly recovery | Refreshes current bot heads, authorizes proven native CI after reconciliation and continues protected main CI and its source-bound release |

## Dependency automation

All npm and GitHub Actions update types, including majors and TypeScript, use the
same complete CI and protected merge policy. Related published package families
are grouped rather than excluded. The six Synapse packages are consumed from
GitHub Packages at the declared `0.0.3` versions; no root file-resolution override
can hide their actual installed version from dependency verification. The canonical implementation is the private
`repository-tasks:dependabot` Nx executor under `tools/nx-plugins/repository-tasks`;
it is separate from the published Wortlaut translation executor. Its modes are
`merge`, `reconcile`, `authorize` and `continue`, and external mutations are never cached.

The privileged controller executes only the trusted default-branch Nx owner,
without installing workspace dependencies or executing PR code or PR artifacts.
Its `merge`, `reconcile`, `authorize` and `continue` operations are non-cacheable.
Branch refresh and merge have Contents/PR write with Actions read. A separate
`authorize` job has only Contents read, PR read and Actions write. It approves
workflow execution through GitHub's native run-approval endpoint; it creates no
PR review, status, check or branch-rule exemption.

Reconciliation after verification/release completion and hourly checks bounded
same-repository bot inventories. A stale branch uses `expected_head_sha` and waits
for the replacement. Only real `pull_request` CI is merge proof. If it is waiting
for execution approval, the isolated authorizer verifies the exact Dependabot or
GitHub Actions service identity of both run actors before one approval request.
A missing native run remains pending. Manual diagnostic `workflow_dispatch` runs
remain available but cannot satisfy protected PR checks or shadow a native run.
Conflicts, real failures and rejected approvals retain the affected PR and attempt.

The isolated authorization job waits for branch reconciliation before reading the
complete bounded current open bot inventory. Every permitted maintenance trigger,
including completed own CI and release runs, inspects those current candidates;
the triggering run's old head, conclusion or attempt does not replace any
candidate's source and native-attempt proof. Approval after a refresh therefore
does not depend on another workflow notification. The hourly pass remains a
fallback for an interrupted event or a not-yet-visible native run.

For every approval and merge, M is current protected main, B the unchanged bot
head, and C GitHub's actual `refs/pull/<number>/merge` commit. The owner checks
unique own-repository PR association, M as ancestor of B, C's ordered parents
[M, B] and C's tree equal to B. Source blobs are verified by Git object digest.
Only the fixed reviewed read-only CI baseline in trusted-main
`verificationPolicy.reviewedCiSha256` authorizes execution: its normalized main
SHA-256 must match that constant, and normalized PR CI must equal normalized main.
Normalization changes only full 40-character action pins with the same action
owner/path and optional SemVer comments. CI logic, scopes, secrets or syntax edits
require a conscious read-only review and explicit policy-digest update; no runtime
or PR input learns a new baseline. This positive review proof does not rely on a
partial YAML parser.

The latest eligible native run is selected independently of diagnostics and its
actual current `run_attempt` is reloaded. All actual jobs must succeed. Ordinary
maintainer-triggered native CI on the bot PR is valid after the same complete
source proof. A later reconciliation re-enters the full merger after a transient
skip, never a reduced path. Workflow/run/PR/M/B/C/protection are re-read immediately
before the ordinary SHA-guarded squash request. GitHub's strict required checks
remain the final merge authority; the actual closed, merged PR is then confirmed.

Confirmed merge outputs from either reconciliation or the CI event reach a
separate continuation job. Recovery resolves the current main commit association
and reads the full PR with `merged: true`; missing confirmation starts nothing.
Main verification receives `expected_head_sha`, and the existing patch release
retains `source_sha`. Existing exact-source main `push` or `workflow_dispatch` runs
are retained in every state, including queued, failed and cancelled. Diagnostic
branch runs do not suppress them. Every new request rechecks current main; a
superseding revision stops it. Interrupted requests can therefore be retried
without merging twice or preparing a duplicate release. Failed releases retain
their original source and artifact instead of receiving a blind new dispatch.

All five actual quality jobs are required, including Ubuntu verification,
classification, macOS, Windows and Quality Gate. Main CI and release continue
independently; main CI retains `expected_head_sha`, release `source_sha`.
The Pages workflow's existing `dev` trigger is unchanged; a main dependency merge
does not deploy Pages. Default-branch activation and its normal package/installer
release follow the owner's explicit authorization. The permanent `dev` branch
remains independent of unrelated main history.

## What a release does

Before preparing a candidate, the workflow compares the push's exact previous and next commits.
The [CI documentation policy](../CONTRIBUTING.md#verification) also applies here: only an explicit
documentation-only result skips preparation, verification, packaging and publication. Unknown or
empty comparisons run in full; a Git comparison failure fails classification. Manual releases and
reusable-workflow calls, including rehearsals, always run the full pipeline. Reusable calls retain
the caller's event, so their `force_verification` input defaults to `true` rather than relying on
the event name.
When `dev` predates the latest tag on `main`, the rehearsal uses the patch version after that tag.

1. `configure` resolves the version, the changelog, the commit and the tag once, on the runner. It pushes nothing, and it hands them on as a bundle.
2. `build` checks out exactly that commit on macOS arm64 and Windows x64 and runs `yarn verify:code`. It then installs and exercises the eight packed packages in fresh npm and Yarn consumers, runs a real Nx target and ESLint run, verifies the built app, makes the installers and exercises the packaged app.
3. `publish` pushes the commit and the tag atomically with the release App, publishes the eight packages, checks the registry, uploads the installers and `SHA256SUMS.txt` to a draft, checks every byte and publishes the draft.

The tag exists before the packages do, and a rerun uses the workflow of the original push. A failed publication can be rerun as long as its cause lies outside the repository. A fix in the repository needs a new version, and the tag of the failed one stays.

The packages are `wortlaut-contracts`, `wortlaut-core`, `wortlaut-ai`, `wortlaut-engine`, `wortlaut-mcp`, `wortlaut-app`, `wortlaut-nx-tasks` and `wortlaut-eslint-rules`. They share one version with the root manifest, which is the version of the desktop app, tagged `v{version}`.

The plugins below `libs/backend/mcp/plugins` keep a version of their own. They hold the server command and a skill, and `npx -y` starts the latest package, so raise it only when one of these two changes.

Installers are not signed, as in Symphony and Resonanz: macOS uses ad-hoc sealing without notarization, and Windows is unsigned.

## Package installation

The supported consumer routes are npm and Yarn with `nodeLinker: node-modules` in
`.yarnrc.yml`. The published packages declare their runtime SDKs and required
Utilities peers; they do not rely on this repository's devDependencies or local dependency overrides.

The Claude Code and Codex plugins use npm's `npx` to start the published CLI.
Configure the following in the npm user configuration available to the assistant.
Set `NODE_AUTH_TOKEN` in the environment that starts the assistant to a GitHub token
with `read:packages` access.

```ini
@pixel-brewery:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Yarn Plug'n'Play is currently unsupported for the CLI, AI, Engine and MCP packages:
Utilities 0.1.187 exposes one root entrypoint that eagerly imports its optional
`ts-morph` and `xml2js` peers. This is an upstream Utilities packaging defect. Use
npm or Yarn's node-modules linker until a corrected Utilities release is available.

## By hand

| Command                                           | What it does                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `yarn release:patch`, `:minor`, `:major`          | Starts `release.yml` on `main` with that increment               |
| `yarn release:dry-run`                            | Shows the next version and changelog on this machine             |
| `gh workflow run release-rehearsal.yml --ref dev` | Rehearses the whole release on the real runners                  |
| `yarn release:audit`                              | Checks that the latest tag of every package matches its manifest |

## What the repository needs

The workflows check the repository by its ID, its name `pixel-brewery/wortlaut` and that it is public.

- The variable `RELEASE_APP_ID`, and the secret `RELEASE_APP_PRIVATE_KEY` in the environment `release-main`, which allows only `main`.
- `.npmrc` and `publishConfig.registry` in the eight manifests. Nx publishes with npm, which does not read `.yarnrc.yml`, so without them the packages go to npmjs.org. A dry run needs no login, so the rehearsal checks the address it names and that GitHub Packages accepts the token.
- The release App installed on the repository. It is the only actor that may push the release commit past the rulesets.
- The rulesets `main: preserve history`, `main: pull requests and verified CI` and `releases: immutable version tags`.
