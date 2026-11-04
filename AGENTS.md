# Wortlaut agent guide

Wortlaut keeps the texts of an application correct in every language: it detects hard-coded
strings, analyzes catalogs, translates with AI, converts formats and sorts keys. One engine
serves the desktop app, the CLI, the Nx executor, the Vite plugin and the MCP server. Read
`docs/README.md` and the relevant feature documentation before making changes. Executable
configuration and verified runtime behavior take precedence over older prose.

## Architecture skill

- Apply [wortlaut-architect](.agents/skills/wortlaut-architect/SKILL.md) for Wortlaut
  engineering work, including delegated tasks. Read its project contract and the inherited
  [Architecture base](.agents/skills/architecture/SKILL.md) with the shared workflow, then
  select the relevant production and testing references.
- `.agents/skills/` is the canonical skill tree. The shared base comes from
  `pixel-brewery/skills`, pinned by full commit and content hash in root `skills-lock.json`.
  Maintain Wortlaut rules in the derived skill, change shared rules upstream and restore or
  update the base through the Skills CLI. Do not edit or reformat the imported base or
  duplicate its common modules locally.
- After skill changes, run `yarn verify:skills`.
- For any interface, screen or theme work also apply the `mosaik-design` skill.

## Workspace and authority

- Work only in the owner-designated local checkout and preserve existing work. Resolve its
  root through Git, and never write a personal absolute path into a repository file.
- Use the ignored `.codex-work/` directory for scratch work, helper scripts, logs and manual
  verification artifacts.
- Implementation and fix requests include task-scoped commits and pushes to `dev`, unless
  the owner requests analysis, a draft or local-only work. Use a `codex/` branch and a pull
  request when protection requires it, and remain responsible through the requested merge.
  Use the designated checkout; do not create extra clones or worktrees without a specific
  request. A change targeting `main` requires the owner's release authorization: never push
  directly to `main`. See [Releasing](docs/release.md).
- Run one heavy install, build, typecheck or test job at a time.
- Reference checkouts of Mosaik, Resonanz, Symphony and Synapse are read-only.

## Git delivery and completion

- Assign one owner for Git staging, commits and refs in this repository. Parallel agents
  may edit disjoint files under that owner's coordination. Inspect existing work before
  staging and preserve unrelated changes; never silently include another task's work.
- Inspect current branch protection and workflow effects before delivery. Run an available
  local Ship-it review before creating a PR, resolve blockers and verify required checks
  at its current head. Do not bypass checks or weaken protection to finish.
- A requested PR merge is complete only when GitHub reports `MERGED` and its result is
  present on the destination branch. Enabling auto-merge or opening a PR is not completion.
- Before reporting completion, fetch, safely fast-forward the designated checkout and
  verify no staged, unstaged or non-ignored untracked changes remain. Each retained local
  branch must match its own upstream; development and release branches may differ.
- Remove temporary branches and worktrees only after proving their work is integrated.
  Preserve unique commits, untracked files and necessary ignored data first. Keep the
  designated checkout and permanent integration branches; never force-reset away work.
- If delivery is blocked, report the exact blocker and preserved work instead of calling
  the task complete. This policy does not authorize releases, package publication,
  deployment, visibility changes or protected-history rewrites.

## Production owners

- Thin application roots: `apps/cli` (the `wortlaut` command), `apps/desktop` (Electron main and
  preload, its build in `apps/desktop/tools/build.mjs`), `apps/frontend/app` (the Angular root).
- `libs/backend/core`: detectors, presets, readers, analyzer rules, transformers, sorting.
- `libs/backend/ai`: translation strategies, chunking, prompts, validating model output.
- `libs/backend/engine`: use cases for projects, configuration, change sets, runs, rule packs,
  workspaces, the test lab and what assistants ask of it.
- `libs/contracts`: Zod schemas and types for IPC, runs and settings, the one typed contract that
  crosses main and renderer.
- `libs/backend/mcp`: the MCP server and its tools over the engine, their levels and the plugins.
- `libs/frontend/core`: the IPC client, the session of the app, formatting and providers.
- `libs/frontend/ui`: reusable components and the Soho theme on Mosaik.
- `libs/frontend/shell`: title bar, sidebar and the frame of the views.
- `libs/frontend/features/<domain>`: one per product area, with views and view presenters. A feature
  imports another only through its public export. A domain that is not built has no folder, and its
  route shows the empty state.

Every write is a change set. API keys never leave the keychain. The old `localizator` names
keep working for existing consumers, see the [Surfaces reference](.agents/skills/wortlaut-architect/references/surfaces.md).

## Issue tracking

- The [Wortlaut board](https://github.com/users/RueDeRennes/projects/10) is the single source
  of truth for confirmed work and defects. Use issues in `pixel-brewery/wortlaut` and add each
  one to the board yourself, because the repository link does not. Keep no local backlog.
- Search open and closed issues first. Update an existing issue instead of creating a
  duplicate, and reopen one for a confirmed regression.
- Give an issue a concrete title, the affected paths, the evidence, the expected and actual
  behavior and any workaround. Defects take the `bug` label. Keep suspicions off the board.
- Read the Status, Priority and Size field IDs from GitHub, never guess them. New work goes to
  `Backlog`, active work to `In progress` and verified work to `Done`. Close verified issues
  as completed.
- A defect in Mosaik or another dependency belongs on that project's board, not here.
- Use `gh`. If an injected token lacks Projects access, use the saved login with
  `env -u GH_TOKEN -u GITHUB_TOKEN gh ...`. If a write still fails, report the exact blocker
  and every unsynced finding in the task response. Never claim it was saved, and do not
  create a Markdown backlog in its place.

## Commands

- `yarn install` needs `GITHUB_TOKEN` for `@pixel-brewery/*` on GitHub Packages.
- `yarn nx run-many -t build --parallel=1` and `yarn nx run-many -t test --parallel=1`
- `yarn typecheck`, `yarn lint`, `yarn verify:skills`, `yarn verify:structure`, `yarn verify:paths`
- `yarn start` builds the renderer and the desktop bundles and runs the app.
- `yarn package` and `yarn make` package the app for this machine into the ignored `out/`.

Prefer running tasks through Nx, prefixed with Yarn. Do not guess Nx flags.
