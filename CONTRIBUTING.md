# Contributing to Wortlaut

Use the [issue templates](https://github.com/pixel-brewery/wortlaut/issues/new/choose) for
reproducible reports and ideas. Follow the [code of conduct](CODE_OF_CONDUCT.md). Report security
vulnerabilities through the [private channel](SECURITY.md).

## Workspace and startup

Use Node **24 LTS**, at least `24.15.0`, and Yarn **4.18.1** from `package.json`. The Pixel Brewery
packages come from GitHub Packages, which needs a `GITHUB_TOKEN` with `read:packages` even for
public packages.

```sh
yarn install --immutable
yarn start
```

Personal absolute paths, real catalogs of a private project and credentials do not belong in
tracked source, documentation or test artifacts. Scratch work belongs in the ignored `.codex-work/`
directory.

## Implementation

Agents apply the [Wortlaut Architect](.agents/skills/wortlaut-architect/SKILL.md), and
[AGENTS.md](AGENTS.md) holds the rules of the repository. Every write is a change set, and API
keys never leave the keychain.

## Verification

```sh
yarn format:check
yarn verify
```

`yarn format` applies the shared Prettier style to repository-owned source. It uses the
Angular parser for frontend templates and preserves installed guidance, vendor inputs and
generated artifacts. ESLint still applies the shared code and architecture rules.

`yarn verify` first runs `verify:code`, which covers repository rules, Mosaik source
checks, formatting, lint, types, tests and builds. It then installs the packed packages in
fresh npm and Yarn consumers, exercises the built desktop app and runs `package:smoke`.
Use a graphical desktop session and the package-registry access used for dependency
installation. The native smoke tests use isolated projects and profiles.

`yarn e2e` builds and exercises the unpackaged app. `yarn package:smoke` (also
`yarn forge:package`) creates the local Forge package, verifies the archive contents and
exercises the packaged executable. `yarn test:e2e` and `yarn test:e2e --packaged` reuse
their respective existing outputs.

Wortlaut keeps its English interface copy in source. The engine and clean-consumer checks
verify catalog behavior, including a real Nx catalog analysis and an ESLint run on resources
in the isolated npm consumer.

Work goes to `dev`. A code change merged into `main` requests a release, see [Releasing](docs/release.md).

CI classifies the complete pull-request, merge-queue or push diff before installing dependencies.
When every changed path is documentation, it skips all tests, builds and packaging; the required
Quality Gate still runs, together with public-content and portable-path checks. The three platform
check names remain present as short Ubuntu jobs that only explain the skip; they do not perform
platform verification. Prose files,
README text files, root license notices and images under `docs/` or `.github/assets/` qualify.
Agent instructions, skills, prompts, executable files, configuration and mixed changes always
run full verification. Manual CI runs also run full verification. See [Releasing](docs/release.md)
for the matching automatic-release policy.
