# Desktop transport and native lifecycle

Read [the base platform module](../../architecture/references/common/platform.md) with this
page. Resonanz shows the established Electron shape; read it and do not depend on it.

## Typed IPC

Keep request methods, payloads, responses and events in `libs/contracts`. Validate requests,
responses and events at their receiving boundary and check the sending window in main. The
sandboxed preload exposes only `request` and `onEvent`, and a subscription returns its
cleanup function.

Renderer DTOs hold no secrets and no engine objects. Paths appear only as the display values
the design shows. File and folder selection goes through native dialogs in main, and main
checks that later requests stay inside the chosen roots. The renderer names a chosen folder by
an opaque token and a stored thing by its id; no request has a field for a path. A dropped
folder goes from the preload straight to main, which answers with a token or a message.

`ProfileWatcher` tells the renderer when another process changed `changes/` or `runs/` of the profile, such as the MCP server, as
`changes.updated` and `runs.updated`. The steps of MCP and plugins hold the checked path of the command line next to the app, because
they have to be pasted somewhere else.

## Windows and security

`contextIsolation` and the sandbox stay on and `nodeIntegration` stays off. The renderer
loads only packaged content, and external links open in the system browser. A protocol or
permission is added only for a named need.

`apps/desktop` stays a thin root. Its build is `apps/desktop/tools/build.mjs`, which fails on
any package a bundle leaves to the runtime without declaring it, so the package holds no
`node_modules`. `apps/desktop/forge.config.mjs` packages the bundles and the renderer into `out/`, with its spec beside it and
its icons in `apps/desktop/assets/icons`: `yarn package` and `yarn make`. It flips no fuse and uses no certificate, as Resonanz
does not. What can run without Electron lives behind `INativeHost` and is tested without it.

## Keys

API keys go through Electron `safeStorage` into the profile. The renderer can set, test and
clear a key and learn whether one exists; it can never read one back. Whether a key exists is read from the file alone, so
looking at the settings raises no keychain dialog. `WORTLAUT_SECRET_STORE=memory` keeps keys in memory for automated runs, and
`WORTLAUT_OPENAI_BASE_URL` and `WORTLAUT_GOOGLE_BASE_URL` name another address of a provider, `WORTLAUT_GITHUB_API_URL` and
`WORTLAUT_NPM_REGISTRY_URL` of a source of rule packs.

## Settings: application

`AppSettingsStore` keeps them in `settings.json` of the profile, and they apply at once. Start in dry run sets the switch when the app
starts. Cache results and Verbose log reach every run through the `hosting` of `RunHost`. Color mode sets `nativeTheme.themeSource`, so
the page reads a choice like any change of the system.

## Lifecycle

The app runs a single instance. Long runs live in the main process, in `RunHost`, and
survive a renderer reload: a renderer asks what is going on and listens again. Run on all projects is a batch there: a bounded number of
runs at a time, one for a translation, one result per project, and a cancel that stops all of it. Cancellation and shutdown are awaited: stop the run, close owned
processes and finish or discard a change set before declaring completion. A renderer
failure never leaves a partial write behind.
