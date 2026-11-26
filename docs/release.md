# Releasing

A release works as in Symphony and Resonanz: a source change pushed to `main` requests one.
Documentation-only pushes skip the release. `dev` is where work happens, and merging a code change
into `main` releases it. Releases belong to the owner.

| Workflow | When | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, the merge queue, pushes to `main` and `dev` | Classifies the complete diff; code changes verify on Linux, macOS and Windows, then exercise the built and packaged app on macOS and Windows |
| `release.yml` | Code push to `main`, or by hand | One release candidate, then the installers and the packages; documentation-only automatic pushes stop before preparation |
| `release-rehearsal.yml` | Changes to the release on `dev`, or by hand | The same on the real runners, and it publishes nothing |
| `dependabot-auto-merge.yml` | After quality/release completion and hourly recovery | Refreshes stale dependency heads and continues verified main CI and the source-bound release |

## Dependency automation

All npm and GitHub Actions update types, including majors and TypeScript, use the
same complete CI and protected merge policy. Related published package families
are grouped rather than excluded. The six Synapse packages are consumed from
GitHub Packages at the declared `0.0.3` versions; no root file-resolution override
can hide their actual installed version from dependency verification. The canonical implementation is the private
`repository-tasks:dependabot` Nx executor under `tools/nx-plugins/repository-tasks`;
it is separate from the published Wortlaut translation executor. Its modes are
`merge`, `reconcile` and `continue`, and external mutations are never cached.

The controller runs trusted default-branch code with no dependency installation
or PR artifacts. Repository ID, public visibility and default branch are checked.
It refreshes stale same-repository bot PRs with `expected_head_sha`, waits for the
replacement and dispatches full CI with the same expected revision. CI rejects a
changed revision before classification. Existing failed exact-head attempts stay
available for diagnosis; a run waiting for approval does not suppress explicit CI.
Conflicts block the affected PR without preventing other bot PRs from proceeding.

A dispatched verification without direct PR metadata must map uniquely to an open
Dependabot PR with the same repository, branch and head. All five current-attempt
jobs must succeed. The final ordinary squash request guards the tested head after
re-reading the PR, run and current main; GitHub's strict branch rules remain
binding. No reviews or branch-rule bypasses are created.

A successful native-token merge explicitly requests full main CI and the existing
patch release, since GitHub suppresses ordinary push workflows for `GITHUB_TOKEN`.
Both continuations check the exact merged source, retain existing attempts and
stop for a superseding main revision. The existing release input remains
`source_sha`; CI receives `expected_head_sha`. Quality/release completion and the
hourly fallback reconcile remaining bot PRs after release metadata advances main.
Privileged workflows use a native Node bootstrap of the same Nx-owned implementation
so no workspace dependencies execute with write permissions.

Development delivery on `dev` does not activate this default-branch controller.
Activation requires the separately owner-authorized integration of these exact
changes into `main`, which also starts the existing automatic desktop/package
release. Development branding and unrelated dev history are not prerequisites.

## What a release does

Before preparing a candidate, the workflow compares the push's exact previous and next commits.
The [CI documentation policy](../CONTRIBUTING.md#verification) also applies here: only an explicit
documentation-only result skips preparation, verification, packaging and publication. Unknown or
empty comparisons run in full; a Git comparison failure fails classification. Manual releases and
reusable-workflow calls, including rehearsals, always run the full pipeline. Reusable calls retain
the caller's event, so their `force_verification` input defaults to `true` rather than relying on
the event name.

1. `configure` resolves the version, the changelog, the commit and the tag once, on the runner. It pushes nothing, and it hands them on as a bundle.
2. `build` checks out exactly that commit on macOS arm64 and Windows x64, verifies it, installs the eight packed packages in fresh npm and Yarn consumers outside the checkout, uses them there, runs a real Nx target and a real ESLint run, makes the installers and exercises the packaged app.
3. `publish` pushes the commit and the tag atomically with the release App, publishes the eight packages, checks the registry, uploads the installers and `SHA256SUMS.txt` to a draft, checks every byte and publishes the draft.

The tag exists before the packages do, and a rerun uses the workflow of the original push. A failed publication can be rerun as long as its cause lies outside the repository. A fix in the repository needs a new version, and the tag of the failed one stays.

The packages are `wortlaut-contracts`, `wortlaut-core`, `wortlaut-ai`, `wortlaut-engine`, `wortlaut-mcp`, `wortlaut-app`, `wortlaut-nx-tasks` and `wortlaut-eslint-rules`. They share one version with the root manifest, which is the version of the desktop app, tagged `v{version}`.

The plugins below `libs/backend/mcp/plugins` keep a version of their own. They hold the server command and a skill, and `npx -y` starts the latest package, so raise it only when one of these two changes.

Installers are not signed, as in Symphony and Resonanz: macOS uses ad-hoc sealing without notarization, and Windows is unsigned.

## Package installation

The supported consumer routes are npm and Yarn with `nodeLinker: node-modules` in
`.yarnrc.yml`. The published packages declare their runtime SDKs and required
Utilities peers; they do not rely on this repository's devDependencies or local dependency overrides.

Yarn Plug'n'Play is currently unsupported for the CLI, AI, Engine and MCP packages:
Utilities 0.1.187 exposes one root entrypoint that eagerly imports its optional
`ts-morph` and `xml2js` peers. This is an upstream Utilities packaging defect. Use
npm or Yarn's node-modules linker until a corrected Utilities release is available.

## By hand

| Command | What it does |
| --- | --- |
| `yarn release:patch`, `:minor`, `:major` | Starts `release.yml` on `main` with that increment |
| `yarn release:dry-run` | Shows the next version and changelog on this machine |
| `gh workflow run release-rehearsal.yml --ref dev` | Rehearses the whole release on the real runners |
| `yarn release:audit` | Checks that the latest tag of every package matches its manifest |

## What the repository needs

The workflows check the repository by its ID, its name `pixel-brewery/wortlaut` and that it is public.

- The variable `RELEASE_APP_ID`, and the secret `RELEASE_APP_PRIVATE_KEY` in the environment `release-main`, which allows only `main`.
- `.npmrc` and `publishConfig.registry` in the eight manifests. Nx publishes with npm, which does not read `.yarnrc.yml`, so without them the packages go to npmjs.org. A dry run needs no login, so the rehearsal checks the address it names and that GitHub Packages accepts the token.
- The release App installed on the repository. It is the only actor that may push the release commit past the rulesets.
- The rulesets `main: preserve history`, `main: pull requests and verified CI` and `releases: immutable version tags`.
