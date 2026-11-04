# Releasing

A release works as in Symphony and Resonanz: a source change pushed to `main` requests one.
Documentation-only pushes skip the release. `dev` is where work happens, and merging a code change
into `main` releases it. Releases belong to the owner.

| Workflow | When | What it does |
| --- | --- | --- |
| `ci.yml` | Pull requests, the merge queue, pushes to `main` and `dev` | Classifies the complete diff; code changes verify on Linux, macOS and Windows, then exercise the built and packaged app on macOS and Windows |
| `release.yml` | Code push to `main`, or by hand | One release candidate, then the installers and the packages; documentation-only automatic pushes stop before preparation |
| `release-rehearsal.yml` | Changes to the release on `dev`, or by hand | The same on the real runners, and it publishes nothing |
| `dependabot-auto-merge.yml`, `rebase-dependabot.yml` | After a green Dependabot pull request, after a release | Merges only the unchanged head, requests its release and refreshes the others |

## What a release does

Before preparing a candidate, the workflow compares the push's exact previous and next commits.
The [CI documentation policy](../CONTRIBUTING.md#verification) also applies here: only an explicit
documentation-only result skips preparation, verification, packaging and publication. Unknown or
empty comparisons run in full; a Git comparison failure fails classification. Manual releases and
reusable-workflow calls, including rehearsals, always run the full pipeline. Reusable calls retain
the caller's event, so their `force_verification` input defaults to `true` rather than relying on
the event name.

1. `configure` resolves the version, the changelog, the commit and the tag once, on the runner. It pushes nothing, and it hands them on as a bundle.
2. `build` checks out exactly that commit on macOS arm64 and Windows x64, verifies it, installs the six packed packages in fresh npm and Yarn consumers outside the checkout, uses them there, makes the installers and exercises the packaged app.
3. `publish` pushes the commit and the tag atomically with the release App, publishes the six packages, checks the registry, uploads the installers and `SHA256SUMS.txt` to a draft, checks every byte and publishes the draft.

The packages are `wortlaut-contracts`, `wortlaut-core`, `wortlaut-ai`, `wortlaut-engine`, `wortlaut-mcp` and `wortlaut-app`. They share one version with the root manifest, which is the version of the desktop app, tagged `v{version}`.

The plugins below `libs/backend/mcp/plugins` keep a version of their own. They hold the server command and a skill, and `npx -y` starts the latest package, so raise it only when one of these two changes.

Installers are not signed, as in Symphony and Resonanz: macOS uses ad-hoc sealing without notarization, and Windows is unsigned.

## Package installation

The supported consumer routes are npm and Yarn with `nodeLinker: node-modules` in
`.yarnrc.yml`. The published packages declare their runtime SDKs and required
Utilities peers; they do not rely on this repository's devDependencies or Synapse
vendor resolutions.

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
- The release App installed on the repository. It is the only actor that may push the release commit past the rulesets.
- The rulesets `main: preserve history`, `main: pull requests and verified CI` and `releases: immutable version tags`.
