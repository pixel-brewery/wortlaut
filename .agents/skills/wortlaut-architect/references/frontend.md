# Frontend and design

Read [the base frontend module](../../architect/references/common/frontend.md),
[frontend patterns](../../architect/references/common/frontend-patterns.md) and the
[Wortlaut Designer](../../wortlaut-designer/SKILL.md) with this page. That local role
combines the shared Designer and mandatory catalog workflow with the product's concrete
[design contract](../../wortlaut-designer/references/project.md).

## Foundations

- Theme: Soho (design), in light and dark (design)
- Primary, font and shape: the theme's values (theme)
- Interface language: English (design)

## Rules

- Every control is a real Mosaik component through `@pixel-brewery/mosaik-elements-angular`.
  Layout is native CSS and never `mosaik-stack`. Values come from `--mosaik-*` tokens.
- A view binds to a presenter. A presenter calls typed IPC and holds view state. Neither
  contains engine logic.
- The design's patterns are binding: real `Card`s for panels, one solid primary action per
  view, a visible dry-run switch, states for empty, loading, failure and success.
- Sample values on the canvas are examples. Real values come from the engine, and a screen
  shows its true empty state when there are none.

## Mapping

`apps/frontend/app` is a thin root: `src/main.ts`, `src/index.html`, `src/styles.scss`,
`src/configuration/{Navigation,Routes,ShellConfig}.ts` and `src/views/ShellView.*`, and nothing
else. Below it:

- `libs/frontend/core`: the IPC client, the session of the app, formatting and providers.
- `libs/frontend/ui`: reusable components, the Soho theme and the shared styles.
- `libs/frontend/shell`: title bar, sidebar and the frame of the views. The shell is the title
  bar and the sidebar.
- `libs/frontend/features/<domain>`: one library per product area, named
  `frontend-feature-<domain>`, with `src/index.ts` and
  `src/lib/{components,contracts,provider,routing,view-presenters,views}`. The domains are
  `start`, `workspaces`, `overview`, `translations`, `detect`, `analyze`, `generate`,
  `transform`, `test-lab`, `rules`, `connect`, `runs` and `settings`.

Each view has its presenter as `<Name>ViewPresenter`. Features import each other only through
their public exports. A feature's index exports routes that load their views lazily, so Mosaik's
controls evaluate after the theme is applied, and a presenter imports no Mosaik, so its spec runs
without a browser. A domain that is not built has no folder, and its route shows
`notAvailableRoute`, a true empty state.

Routes follow the sidebar: projects, rule packs, review, overview, translations, detect, analyze,
generate, transform, test lab, runs, MCP, CLI and Nx, settings.

A view that starts a command follows it through `CommandRun`, which asks main again after a reload: the run lives there. A
control that writes shows `wortlaut-write-result`, and every screen that can write shows `wortlaut-dry-run-notice`.

`ShortcutCenter` answers ⌘K, ⌘Enter, ⌘J and ⌘↓, with Ctrl on Windows and Linux. A presenter calls `bindShortcuts` with what its view
offers, and the view that opened last answers. The search of the title bar is `SearchPalettePresenter`: commands come from the routes, keys
and files from main, and a key opens at `/translations?key=`.

Render each changed view in the app in both modes before calling it done.
