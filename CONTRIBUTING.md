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
yarn verify
yarn test:e2e
yarn package && yarn verify:package && yarn test:e2e --packaged
```

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
