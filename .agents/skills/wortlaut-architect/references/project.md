# Project contract and working environment

Read root [AGENTS.md](../../../../AGENTS.md) and the
[documentation index](../../../../docs/README.md) before changing behavior. Current
contracts, executable configuration, installed public APIs and observed runtime behavior
resolve stale documentation.

## Scope and composition

Wortlaut keeps the texts of an application correct in every language. It detects
hard-coded strings, analyzes catalogs, translates with AI, converts formats and sorts
keys. It came out of `tools/localizator` in the Mosaik repository and keeps that tool's
behavior until a change says otherwise.

One engine serves every surface: the desktop app, the CLI, the Nx executor, the Vite
plugin and the MCP server. Cloud is named in the design as a later surface and is not
built. Keys live in the system keychain, catalogs and configuration in the user's
repository, and workspaces and run history in the user's profile.

The design is the [Wortlaut canvas](https://claude.ai/artifact/VeGSmjguhc7YVZX9Dbjt2q).
[The feature map](../../../../docs/architecture/feature-map.md) assigns each of its boards to
owners. It is a blueprint for the product, so a behavior it shows is a requirement,
and a sample value on it is not.

## Layout

Application roots stay thin: `apps/cli`, `apps/desktop` and `apps/frontend/app`. The engine and
what it stands on live in `libs/backend/{core,ai,engine}`, the frontend in
`libs/frontend/{core,ui,shell}` and `libs/frontend/features/<domain>`. `libs/contracts` stays on
its own, because it is the one typed contract that crosses main and renderer. Package and Nx
project names do not follow the folders: `@pixel-brewery/wortlaut-core` and its siblings keep
the names they are published under. `yarn verify:structure` checks all of this.

## Source conventions

- Use strict TypeScript and explicit public interface contracts. Interfaces use `I` names
  and private fields use `_` names. Keep public exports explicit in each `Index.ts`.
- Follow the owning files' `#region` structure. Keep abstractions at real substitution or
  ownership seams; pure projections and calculations remain functions.
- Use focused constructor injection and explicit composition at surface boundaries.
  Angular uses its supported injection and lifecycle APIs. Engine code stays free of
  Electron, Angular and terminal concerns.
- Add concise English TSDoc to changed public contracts and non-obvious behavior. Match
  adjacent source and spec basenames.
- Repository documentation and original technical prose are English. Product copy is
  English. Replies to the owner are German.

## Local execution

Work in the designated checkout and preserve existing edits. Use the ignored
`.codex-work/` for scratch files, profiles and verification artifacts. Do not write
personal absolute paths into repository files.

Use the toolchain in [package.json](../../../../package.json) and
[.nvmrc](../../../../.nvmrc), Yarn and the configured Nx targets. Run one heavy install,
build, typecheck or test job at a time across the team. Inspect task-owned processes before
starting helpers and stop them afterwards while preserving unrelated processes.

Checkouts of Mosaik, Resonanz, Symphony and Synapse are read-only references for an
established pattern. Normal installation and skill use must work without them. A change
in Mosaik belongs to the integration step in [Surfaces](surfaces.md).

## Authority

Commit or push only on request. Never create branches, worktrees or pull requests unless
the owner asks for that specific action. Releases and package publishing belong to the
owner. Do not install assistant CLIs, start a native login or read an assistant's
credentials on the user's behalf.
