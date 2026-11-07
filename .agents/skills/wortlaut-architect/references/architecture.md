# Architecture and source owners

Read [the base architecture module](../../architect/references/common/architecture.md)
with this page. It records who owns what, so a feature lands in one place and every surface
gets it.

## Dependency direction

```text
apps/frontend/app ── libs/frontend/{features/*,shell} ── libs/frontend/ui ── libs/frontend/core ── libs/contracts (types)
apps/desktop ─┬─ libs/contracts
apps/cli ─────┤
libs/backend/mcp ─┼─ libs/backend/engine ─┬─ libs/backend/ai ── libs/backend/core
                                          └─ libs/backend/core
```

Dependencies point down. A library never imports an app, and `libs/backend/*` imports
neither Electron nor Angular. The renderer reaches the engine only through typed IPC, so it
holds no paths, keys or engine objects, and only the types of `libs/contracts`.
`tools/workspace/verify-structure.mjs` enforces this layout and these directions.

## Owners

| Owner                             | Package                             | Owns                                                                                        |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `libs/backend/core`               | `@pixel-brewery/wortlaut-core`      | Detectors, presets, readers, analyzer rules, transformers, serializers, sorting             |
| `libs/backend/ai`                 | `@pixel-brewery/wortlaut-ai`        | Translation strategies, chunking, prompts, validating model output                          |
| `libs/backend/engine`             | `@pixel-brewery/wortlaut-engine`    | Use cases: projects, configuration, change sets, runs, rule packs, workspaces, the test lab |
| `libs/contracts`                  | `@pixel-brewery/wortlaut-contracts` | Zod schemas and types for IPC, runs and settings                                            |
| `libs/backend/mcp`                | `@pixel-brewery/wortlaut-mcp`       | The MCP server and its tools over the engine, their permission levels, the plugins          |
| `apps/cli`                        | `@pixel-brewery/wortlaut-app`       | The `wortlaut` command, argument parsing, terminal output                                   |
| `apps/desktop`                    | not published                       | Electron main and preload, windows, dialogs, keychain, Synapse host                         |
| `apps/frontend/app`               | not published                       | The thin Angular root: routes, navigation, composition                                      |
| `libs/frontend/core`              | not published                       | The IPC client, the session of the app, formatting and providers                            |
| `libs/frontend/ui`                | not published                       | Reusable components and the Soho theme on Mosaik                                            |
| `libs/frontend/shell`             | not published                       | Title bar, sidebar and the frame of the views                                               |
| `libs/frontend/features/<domain>` | not published                       | One product area: its views, view presenters and routes                                     |

## Invariants

- **One engine.** A rule, format, preset or provider is added once, below the surfaces. A
  surface parses input and presents output, nothing else.
- **Every write is a change set.** No surface writes a catalog or source file directly. The result cache is the one exception: it holds
  nothing of the repository and ignores itself in Git. The
  engine produces a change set and applies it, leaves it in the review list or only reports
  it, as the surface asks. The CLI and `run()` apply straight away by default, because
  existing targets depend on it. Dry run is the default in the app.
- **Configuration has one resolution.** `nx.json` target defaults, `project.json`, its
  configuration, then `wortlaut.config.json` or else `localizator.config.json`, then command
  arguments. The settings screen shows where each value comes from. For compatibility a call
  with `--resource-root` reads no Nx file, and `run()` reads no file.
- **Rule packs are declarative and pinned.** They hold no code and are pinned by commit and
  content hash in `wortlaut.lock.json`.
- **Secrets stay out.** API keys live in the keychain and never reach the renderer, a run
  log, a change set or the repository.
- **Long work is cancellable.** Runs report progress, respect cancellation and leave no
  partial write behind. What a failed or stopped run finished waits in the review list.
