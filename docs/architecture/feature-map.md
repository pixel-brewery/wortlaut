# Wortlaut feature map

The [Wortlaut canvas](https://claude.ai/artifact/VeGSmjguhc7YVZX9Dbjt2q) is the blueprint. A behavior
on a board is a requirement. A sample value on a board is not: real values come from the engine, and a
screen shows its true empty state when there are none. Cloud is shown as "Later" and is not built.

Wortlaut is the renamed `tools/localizator` from the Mosaik repository, growing into a desktop app with
a CLI, an Nx executor, ESLint rules and an MCP server on one engine.

## How to read this map

- **Exists** means the logic is in `tools/localizator` at version 0.1.185 and moves behind a
  `libs/backend/engine` use case with its behavior intact. **New** means no such logic exists today.
- Route paths, view names and IPC names are proposals. `libs/contracts` holds the final names.
- `views/<area>/<Name>View` means the view of that name in `libs/frontend/features/<domain>/src/lib/views`. The domains
  are `start` (Welcome, Project setup), `workspaces` (Workspaces, Projects), `overview`, `translations`, `detect`,
  `analyze`, `generate`, `transform`, `test-lab`, `review` (the review list, which has no board), `rules`, `connect`
  (MCP, CLI and Nx), `runs` and `settings`.
- IPC data is what the view reads: no secrets, no engine objects, and paths only as display values.
- **Conflicts** lists where a board disagrees with itself, with another board, with an invariant or
  with what can be built. Each line says what this map assumes until the owner decides.
- The boards say Localizator. This map says Wortlaut and `wortlaut.*`. Old names appear only where
  they stay supported (the `localizator` binary, `@pixel-brewery/nx-tasks:localizator`,
  `localizator.config.json`, `localizator.lock.json`) and as names of existing classes.

## Rules for every board

- **States:** every view has empty, loading, failure and success, even where only one is drawn.
- **Writes:** a write control builds a change set. Applying rechecks every file and writes all or
  nothing. A file that changed meanwhile fails the apply and names the file.
  Review permits approval or discard only after the loaded detail matches the selected change set.
- **Dry run:** only Generate says what happens to a write control while dry run is on. The engine has three
  write modes: `apply` writes the change set straight away, `review` leaves it pending in the review list, `dry-run`
  only reports it and stores nothing. The CLI and `run()` apply by default, because existing targets depend on it,
  with `--dry-run` and `--review` as options. The app starts a write control in `review` while its dry run is on, and
  the screen says so. That covers everything that writes to a repository, saving settings, `Allow` and `Declare used`
  included: with dry run on nothing reaches a repository until it is approved in Review with dry run off. Settings:
  workspace live in the profile and save at once.
- **"Same as" lines and Copy command:** the engine prints them from the resolved options. They must run
  and produce the same files, and they never contain a key.
- **Long work:** reports progress, can be cancelled, lives in main or a utility process and survives a
  renderer reload.
- **Paths:** chosen through native dialogs. Main checks that later requests stay inside the chosen roots.
- **Locale identity:** structured language choices, table headers and locale rows pair their text with
  decorative Reicon flags from Mosaik. Explicit regional identifiers retain their country; unsupported
  or non-country regions keep their text without a substitute flag. Catalog IDs, settings and technical
  output remain unchanged. Country colors stay intrinsic in both app color modes.
- **Native view frame:** views share a bounded `page-frame` host and a shrinkable `page-content` area.
  Titles, navigation and primary actions stay visible while card bodies, tables or long form stacks
  scroll within their content area. Standalone views keep the native drag strip outside that area.
  Compact windows shrink columns without overlapping them; horizontal table scrolling stays local to
  the table. Nested Settings and Test lab routes receive the remaining height from their parent view.
  Card headings and their actions wrap onto separate lines when a pane is too narrow for both.
- **Resizable panes:** real Mosaik `Split` controls divide navigation, list/detail workspaces and
  comparison/result areas. Horizontal and vertical dividers keep the panels' own scroll owners.
  `PaneSizeDirective` restores the device-local size for each stable pane key after Mosaik measures
  the layout; `PaneSizeMemory` treats unavailable or invalid browser storage as a missing preference.
  Unlocked panes remember a percentage so both panels shrink proportionally with the window; locked
  sidebars and editors remember pixels. Restoring a preference does not count as a user adjustment.
  Mosaik owns pointer/keyboard resizing and clamps sizes to each view's minimum and maximum. The
  Symphony pane-size pattern is the reference; no project settings or catalog files store these sizes.
- **Large collections:** Translations requests fixed pages of 200 matching keys with an offset; changing
  its namespace, search, filter or target locale returns to the first page. It does not grow a request
  beyond the IPC limit. Other long lists expose explicit load-more batches while totals and bulk
  operations retain their full scope.
  Desktop Review requests five files per page and computes diffs only for those files. Complete file
  counts and conflicts still cover the whole change set. Existing callers without a file page retain
  the complete read contract. A diff preview is bounded to 4,000 lines and 131,072 displayed characters
  per file, with an explicit shortened-preview notice; approval still writes the complete file.
  `FileDiffComponent` mounts 200 lines per page while keeping hunk boundaries and line numbers.
  `TextWindowComponent` pages logs, configuration and extracted resource text in 32,768-character
  windows, including text without line breaks. Every retained character remains reachable. A new
  record/tab resets its page; appending to a live log preserves the current page.

---

## Concept: one engine, many surfaces

**Route:** none. No view; this board states the structure.

**What it requires**

- Surfaces on one engine: desktop app (workspaces, review, test lab), CLI (every setting and every
  command), Nx executor (unchanged targets and caching), MCP server (Claude and Codex plugins).
- Cloud is drawn dashed and labeled "Later, same tools and rules". No code path, no stub, no setting
  that does anything.
- The engine offers detect, analyze, generate, transform and sort. Every write is a reviewable change
  set, whichever surface asked for it.
- Extensions: rule packs from GitHub, npm or a folder, pinned by commit and hash. Local AI through
  Synapse (Claude Code, Codex, OpenCode) with their own login. AI with an API key (OpenAI, Google).
  Presets Angular, Lit, React, Vue, Stencil. Formats JSON, RESX, PO, TS.
- In the repository: `nx.json`, `project.json` or `wortlaut.config.json`; `wortlaut.lock.json`; catalogs
  such as `lang.en.json`. On this computer: workspace list, run history, keys in the keychain.

**Engine use cases:** see the closing table.

**IPC reads:** none.

**Conflicts**

- No repository uses the Vite plugin of `infra/vite-plugins`. It leaves Mosaik with the integration step, and Wortlaut
  publishes none.
- "JSON, RESX, PO, TS" does not say read or write. Today JSON, RESX and PO can be read, and TS can only
  be written. This map keeps TS as output only.

---

## Welcome

**Route:** `/welcome`, outside the shell, the start screen when no project is open · `views/start/WelcomeView`

**What the user can do**

- Drop a folder on the drop zone: main checks it is a readable folder and opens Project setup. A file or
  an unreadable folder shows a failure message and stays here.
- Choose folder: native dialog, then Project setup. Cancel stays here.
- Recent: click a workspace to open it. One project goes to Overview, several go to Projects. A workspace
  whose folder is gone stays listed and says so. First launch shows no list, only the drop zone.
- All workspaces: goes to Workspaces.
- The four feature texts are static product copy.

**Engine use cases**

- New: `workspace.recent`, reads the profile and the last known summary, and does not scan on start.
- New: `project.inspectFolder`, see Project setup.

**IPC reads**

- `workspace.recent`: code, color, name, project count, key count, locale count, target route.

---

## Project setup

**Route:** `/setup`, outside the shell · `views/start/SetupView`

**What the user can do**

- Step rail: Folder, Catalogs, Locales, AI provider, with done, current and waiting states. Folder is
  done by Welcome or Workspaces. Continue and Back move between steps.
- Catalogs: choose Add to workspace (existing or New workspace). Framework preset is preselected, with
  the evidence shown (for example "Found @angular/core in package.json"). Source root uses a Mosaik
  FileBox with a native folder picker restricted to the selected repository. Its inferred default
  follows the detected framework's package and source metadata, instead of the largest unrelated
  source tree. Source root and Key prefix show their evidence ("N matching files", "All N keys start
  with it"). Repository configuration remains authoritative; change its source settings after setup.
- Catalogs found: table of folder, files, keys, format. Add another folder opens a native dialog.
  No catalogs found is an empty state, and the user can still continue.
- Locales: choose the base locale from the language repertoire or a discovered regional catalog ID.
  Target cards contain only detected catalogs and explicitly added languages, with no unsolicited
  default suggestions. Toggle target locale chips, each marked "Exists, N keys" or "New". Plus opens a searchable Mosaik
  dialog with a repertoire of 184 ISO language codes and portable English names. Confirming adds the checked
  languages; Cancel or Escape discards the draft. Existing locale IDs are preserved, and the base
  locale is excluded from targets. A new locale creates no file; Overview shows it as "Not created".
- AI provider: choose a local assistant or an API connection, with its registered provider icon and
  true state (local login found, not installed, with API key).
  An API key provider shows a key field. The key goes to the keychain and never to the project.
- Skip AI for now, or Open project. Finishing writes `wortlaut.config.json` as a change set for a
  project without configuration, writes nothing for an Nx project with a target, and opens Overview.

**Engine use cases**

- Exists: catalog scan (`ResourceReader.scanDirectory`), presets (`Presets`), key counts.
- New: `project.inspectFolder` (preset from `package.json`, source root, prefix inference, locale
  discovery, evidence counts), `project.create`, `ai.providers`, `ai.setKey`.

**IPC reads**

- `project.inspectFolder`: preset and evidence, source root and file count, prefix and evidence, catalogs
  (folder, files, keys, format), locales with key counts.
- `workspace.list`: for Add to workspace. `ai.providers`: id, name, kind (local or key), state.

**Conflicts**

- Back cannot leave step 2 on the board. This map assumes Back on Catalogs returns to the screen that
  chose the folder.
- Setup offers four providers without OpenCode, Generate offers five, and the settings boards leave out
  Codex. Every list comes from `ai.providers`.
- A local assistant uses the login the user made with the tool itself. Synapse isolates a profile by default, which would
  hide that login and could never be signed in, because Wortlaut starts no login. So a profile names the folders of the
  tool, and only execution and temporary files live in the profile of Wortlaut.
- Finishing keeps the choices of a project without configuration in the profile, and effective settings show them as
  "Project setup". It also proposes them as `wortlaut.config.json`, the change set above. A configuration in the
  repository always wins over them.

---

## Workspaces

**Route:** `/workspaces`, outside the shell · `views/start/WorkspacesView`

**What the user can do**

- See every workspace as a card: code, color, name, folder, facts (projects, keys, locales, AI) and tags
  (location, rule packs, Nx target, open problems) from the last known state.
- Settings: opens Settings: workspace for that workspace. Open: goes to Overview or Projects.
- Hold to remove: completing the Mosaik PressButton opens a Mosaik MessageBox. Only an explicit
  confirmation removes the saved workspace; Cancel and Escape leave it in place. Repository
  folders and files are never deleted. The workspace list and selected shell state refresh afterwards.
- Workspace and creation-card footers span their full inner card width. Wheel input over a workspace
  card scrolls the surrounding workspace list; it does not stop at a card with no scroll range.
- New workspace: type a name, and the short code follows from it (read-only here, editable in settings).
  Pick one of nine Tailwind600 accents or a custom opaque RGB color with the
  Mosaik ColorPicker. Custom colors are validated, persisted and rendered throughout the app; older
  workspace colors remain supported. Where it runs is fixed to This computer; Cloud is disabled
  with "Cloud comes later".
- Choose repository folder: native dialog. Wortlaut looks for Nx projects and folders with catalogs.
- Create workspace: disabled until name and folder are set, then goes to Project setup.
- No workspaces yet: only the New workspace card.

**Engine use cases**

- New: `workspace.list`, `workspace.create`, `project.discover`.

**IPC reads**

- `workspace.list`: code, color, name, folder, facts, tags.

**Conflicts**

- The hint says "Nx projects with a localizator target", but the samples use a target called `intl`.
  This map assumes discovery matches the executor `@pixel-brewery/nx-tasks:localizator` (and its Wortlaut
  successor) under any target name, plus configuration files and catalog folders.

---

## Projects in a workspace

**Route:** `/projects` · `views/projects/ProjectsView`. The title bar shows no project.

**What the user can do**

- See the project count, Nx target, key total and folder. Add project: native dialog, then Project setup.
- Run on all projects: pick Detect, Analyze, Transform, Sort or Generate; the button label follows.
  Running covers every project of the workspace, reports progress, can be cancelled, respects dry run and
  records one run per project.
- "Same as" shows `yarn nx run-many --target=<target> --configuration=<command>` for Nx workspaces and is
  hidden otherwise.
- All projects: table of project (link to Overview), folder, keys, locales, state badge. Filter by text.
  All or Needs attention. A filter that matches nothing has an empty state. Large lists stay usable.
- Shared by all projects: read-only values from `targetDefaults` in `nx.json`, with Open CLI and Nx.
  Wortlaut reads them and keeps them as the user's source. Hidden without Nx.

**Engine use cases**

- Exists: the five commands, one project at a time.
- New: `project.list`, `runAll` (multi-project runner), `config.sharedDefaults`.

**IPC reads**

- `project.list`: name, folder, keys, locales, state from the last analysis.
- `config.sharedDefaults`: label, value. Events: `run.progress` per project.

**Conflicts**

- The state badge needs an analysis of every project, so opening this screen would mean 26 scans. This map
  assumes the badge shows the last result and adds a "Not analyzed" state, which is not drawn.
- Progress and review across projects are not drawn. This map assumes one run and one change set per
  project, each reachable from Runs.

---

## Overview

**Route:** `/overview` · `views/overview/OverviewView`

**What the user can do**

- See project name, resource root, format and preset.
- Run analysis: goes to Analyze. Translate with AI: goes to Generate. Both are links; neither starts work.
- Key figures: keys and namespaces, translated share (values that differ from the base, after
  exceptions), failing rules, unused keys. Before the first analysis the rule figures say "Not analyzed".
- Next steps: up to three, generated from the real state, each with its action: identical values to
  Analyze, unused keys to Test lab: key patterns, a missing locale to Generate. None open: section hidden.
- Locale coverage: locale, file (or "Not created"), progress, state. Manage locales goes to Settings:
  project.
- Keys by namespace: bars by the first segment after the prefix, largest first, then "N more". Open
  translations goes to Translations.
- Analyzer rules: each rule with pass or its result, plus "N of M pass". Recent runs: last three, with
  All runs going to Runs.
- The page header stays in the window. Dashboard cards bound their content to the available height and
  scroll independently. Rule results combine repeated catalog counts per locale: the badge shows the
  first locale and `+N` more, with every locale total available in a hover or keyboard-focus tooltip.
- Dashboard columns shrink within the window without overlapping. Next-step actions stay in their
  card footers while their descriptions scroll, including at the minimum native window size.

**Engine use cases**

- Exists: catalog reading, `missing-translations` data for coverage, `unused-keys` data.
- New: `project.summary` (coverage, namespaces, next steps, last rule results), `run.list`.

**IPC reads**

- `project.summary`: header, figures, next steps, locales, namespaces, rules.
- `run.list`, limited to three: command, surface, dry run flag, instant, detail.

**Conflicts**

- The next step says "Delete them", but no board has a control that deletes a key. This map adds Delete as
  a row action on `unused-keys` in Analyze, as a change set.

---

## Translations

**Route:** `/translations` · `views/translations/TranslationsView`

**What the user can do**

- Namespace tree: click to filter the table, with counts and "N more".
- Search keys and values. Filter All, Duplicates, Unused, Placeholders. The header shows
  `<namespace> · N of M keys`.
- Add locale: goes to Generate.
- Table: key with flag badges, base value, target value. Click a row to select it.
- Details: full key, base value read-only, target value editable. Save and Revert appear only when
  dirty. Save builds a change set for that catalog.
- Comment: context for translators and for the AI.
- Saving the value preserves an unsaved comment, and saving the comment preserves an unsaved value.
  Edits made while a save is in flight remain in the editor after that save completes.
  A search link selects its initial key; later saves refresh data without reopening that initial key.
- AI suggestion: Suggest uses the base value, the comment and the project instructions. The result shows
  provider and placeholder check. Apply fills the editor without saving. Discard goes back. Without a
  provider the button leads to Settings: AI.
- Changing the target locale discards the previous proposal and cancels an in-flight suggestion, so a
  late answer cannot be applied to another language. In compact windows the namespace rail becomes a
  horizontal strip above the keys and editor.
- Findings: rule results for the key, or "No findings." Used in: `file:line` list, or "No usage found".

**Engine use cases**

- Exists: catalog reading, the rules behind the flags, `UsedKeysFinder` for used or not.
- New: `catalog.namespaces`, `catalog.keys` (search and filter), `catalog.keyDetail`, `catalog.setValue`,
  `catalog.setComment`, key usage with file and line (`UsedKeysFinder` returns keys only),
  `ai.suggestValue`.

**IPC reads**

- `catalog.namespaces`: name, count. `catalog.keys`: key, flags, base value, target value, totals,
  with a bounded `limit` and optional `offset` (default zero).
- `catalog.keyDetail`: values, comment, findings, usages.

**Conflicts**

- JSON catalogs have nowhere to keep a comment, so a JSON project keeps its comments in one repository file,
  `wortlaut.comments.json` next to `wortlaut.config.json`, written as a change set. It is keyed by the path of a catalog
  without its locale and then by key, so several resource roots cannot collide and every locale shares a comment. A catalog
  scan never reads it, also with a resource root at the root of the repository. RESX and PO keep comments in their own files.
  Comments reach the AI prompt as data, apart from instructions. Owner decision of phase 5.
- The table has one target column and no locale picker, which cannot serve a project with five locales.
  This map adds a target locale picker, which is not drawn.

---

## Detect

**Route:** `/detect` · `views/detect/DetectView`

**What the user can do**

- Scan project: runs the detector with progress and can be cancelled.
- Scan settings: framework preset with its file types, source root and key prefix from the project
  (read-only here), key suffix, Write new keys as, Skip test files. "Same as" follows the settings.
- Result figures: files scanned, strings found, already keys, hard-coded.
- Hard-coded strings: string, location, generated key, hint. Click a row to select it. None found is an
  empty state. Turning Skip test files off adds test-file rows marked "Test file".
- Hint: "Reuse <key>" when the base value equals the string, otherwise "New key".
- Proposed change: file with before and after. Ignore removes the row from this scan. Apply to source and
  catalog builds one change set over the source file and the catalog.
- Apply all: one change set for all rows. Name keys with AI: replaces generated keys with proposals; needs
  a provider.

**Engine use cases**

- Exists: `detect` (`LocalizationProcessor`, `Presets`, `KeyGenerator`, `JsonFormatter`, `ResxFormatter`).
  Detect writes nothing today.
- New: skip test files (only analyze does this today), `.tsx` for React, prefix on generated keys, reuse
  hints, source rewrite at line and column, `detect.apply`, `ai.nameKeys`.

**IPC reads**

- `detect.run` result: figures, rows (string, location, generated key, hint), change preview per row.
- `project.get`: preset, source root, prefix, suffix.
- Events: `run.progress`, `run.log`.

**Conflicts**

- The "Same as" line cannot run today: `DetectCommand` registers no flags, so `--preset`, `--root` and
  `--type` reach it only through `run()`. This map registers them.
- "Write new keys as" offers TypeScript and PO. PO has a formatter and works, while `Formatters.get` still throws for TS,
  which cannot be read back. It also duplicates Resource format in Settings: project. This map assumes new keys go to the
  project's catalog format (JSON, RESX or PO).
- The list says React covers `.jsx, .tsx`, but `ReactPreset` registers `.jsx`, `.js` and `.ts`. Vue and
  Stencil labels also differ from their presets and between boards. This map adds `.tsx` and takes every
  label from the preset.
- The sample generated key `ready.to.record` has no prefix, and without the prefix the next scan reports it
  as hard-coded. This map assumes generated keys carry the project's prefix and suffix.

---

## Analyze

**Route:** `/analyze` · `views/analyze/AnalyzeView`

**What the user can do**

- Run N rules: the count follows the switches, and zero disables the button.
- Rule list, grouped as built-in rules and "Pack: <name>": a switch per rule, the id, a result badge
  ("Off" when off) and a short description. Click to show the rule's result.
- The rule badge shows one locale total and `+N` additional locales; hover or focus reveals all locale
  totals. Counts from several catalogs of the same locale are combined. A trailing `+` on a count
  means some findings for that locale have no reported count.
- The page heading and run action stay fixed. Rule-list, result-table and exception contents scroll
  within their cards; card headers and the rule/result footers remain visible.
- Without a source root `unused-keys` is not run by default, as today.
- Get more rules: goes to Rule packs.
- Result card: title, message, table and "Showing N of M". Row action by rule: Merge keys on
  `duplicate-values`, Allow on `missing-translations` (adds the value to Identical values), Declare used on
  `unused-keys`, Allow on `text-expansion`, Open file on a passed rule.
- Translate with AI: goes to Generate with these keys as scope. Suggest patterns: goes to Test lab: key
  patterns with a proposal.
- Exceptions: Used keys, Identical keys, Identical values as chips, with Test patterns and Edit in settings.
- No analysis yet: empty state.

**Engine use cases**

- Exists: `analyze` with `--rules`, `--root`, `--resource-root`, `--preset`, `--base-locale`,
  `--used-keys`, `--identical-keys`, `--identical-values`, `--resource-key-prefix`,
  `--resource-key-suffix`. Seven rules in `ResourceAnalyzer`.
- New: findings per rule in one shape (rule, key, locale, message), pack rules through `IAnalyzerRule`,
  severity, per-run rule selection on top of configuration, `catalog.mergeKeys`, `catalog.deleteKey`,
  `config.addException`, `ai.suggestPatterns`, open a file in the editor.

**IPC reads**

- `analyze.rules`: id, group, description, enabled, last result.
- `analyze.run` result: per rule title, message, columns, rows, total.
- `config.exceptions`: three lists. Events: `run.progress`, `run.log`.

**Conflicts**

- Allow on `text-expansion` has no list to write to: the three exception lists serve other rules. This map
  adds per-rule exceptions to the configuration.
- A rule can be turned off in three places: the switch here, the checkboxes in Settings: project and the
  severity in Rule packs. This map stores one value, the severity in the repository's configuration.
  `off` means not run, the settings checkbox edits the same value, and the switch here affects this run
  only.

---

## Transform and sort

**Route:** `/transform` · `views/transform/TransformView`

**What the user can do**

- Target formats: TypeScript, RESX, PO as checkboxes with descriptions. Transform N formats: the count
  follows, and zero disables the button.
- A file is written only when its content changes. Unchanged files say "Unchanged, not written".
- Sort keys: Ascending or Descending, with the key and file count. Sort files runs the sort.
- "Same as": one line each for transform and sort.
- Result table: file, keys, state ("Would be written" in dry run, "Written" otherwise). Click a row to
  preview it. The card title says "Result of the dry run" only while dry run is on.
- Preview: the real serialized content of the selected file.
- Failure: a serializer error, such as a key that is both a value and a parent, names the key and writes
  nothing.

**Engine use cases**

- Exists: `transform` (`--types`, `--type`, `--resource-root`, `--dry-run`, up-to-date check), `sort`
  (`--order`, `--type`, `--resource-root`, `--dry-run`), all four serializers.
- New: both produce change sets instead of writing directly, preview of a target file, finishing PO.

**IPC reads**

- `transform.formats`: id, name, description. `transform.run` result: file, keys, state, preview.
- `sort.run` result: file, state. `catalog.stats`: key and file count.

**Conflicts**

- JSON is not a target here, although Welcome promises it and `--types json` works today, so a RESX project
  could not convert to JSON. This map takes targets from the engine, minus the source format.
- PO is labeled "Still in development" but drawn as a normal option. The serializer exists, and `--type po`
  is not an accepted CLI value. This map finishes PO and removes the label.
- The board previews only the base locale. This map previews the row the user selected.

---

## Generate: set up

**Route:** `/generate` · `views/generate/GenerateSetupView`

**What the user can do**

- Target locales: chips with their real state. Add locale adds a validated locale to the project.
- Keys: All keys, Only missing or Namespace (with a picker). Limit: a number, empty means no limit.
- Provider: Claude Code, Codex, OpenCode, OpenAI, Google Gemini with their true state. One that is not set
  up cannot start a run. Manage providers goes to Settings: AI.
- Model: local assistants show "Default of the assistant" and "Local assistants use their own model
  settings." API key providers list their models and show Temperature, 0.0 to 1.0 in steps of 0.1.
- Chunk size: 1 to 100.
- Instructions: added to the prompt for every chunk, starting from Settings: AI. Full prompt shows the real
  prompt.
- This run: locales, keys, chunks and estimated tokens (labeled as an estimate), updated on every change.
  No locale disables Start translation.
- Review before writing and Protect placeholders: switches for this run, starting from Settings: AI.
- A note says dry run is on and where to turn it off.
- Start translation: goes to the run. Test on 10 keys first: goes to Test lab: translation with this setup.
- "Same as" follows every control.

**Engine use cases**

- Exists: `generate` (`--strategy` chatgpt or gemini, `--locales`, `--base-locale`, `--api-key`, `--model`,
  `--temperature`, `--type`, `--resource-root`, `--chunk-size`, `--only-new`), `limit` and `instructions`
  through `run()` only.
- New: local strategies through Synapse, key scopes, `ai.models`, `ai.estimate`, `ai.promptPreview`,
  per-locale instructions.

**IPC reads**

- `project.get`: locales and their state. `ai.providers`: id, name, kind, state.
- `ai.models`: per provider. `ai.estimate`: keys, chunks, tokens. `ai.promptPreview`: text.
- `config.aiDefaults`: starting values. `generate.command`: the "Same as" line.

**Conflicts**

- Only missing counts German's 7 values that are identical to English, but `--only-new` translates only
  keys the target lacks, so the "Same as" line would translate nothing. This map adds a scope option:
  all, new, missing (absent or identical, minus exceptions) and a namespace. `--only-new` keeps its meaning.
- The "Same as" line leaves out the key, limit, instructions and namespace. `--api-key` is required today,
  `--instructions` is defined but not registered, `--limit` does not exist, and a plain Node CLI cannot read
  Electron `safeStorage`. This map registers the flags and lets the CLI read keys from the environment.
- Provider names disagree: the CLI accepts `chatgpt` and `gemini`, the default is `openai`, and the boards
  mix them. This map accepts all four as today and adds `claude-code`, `codex`, `opencode`.
- Review before writing off contradicts "all results stay proposals until approved". This map treats it as
  an explicit write flag: the change set is built and approved automatically at the end of the run.
- Protect placeholders off would let broken placeholders through, against the model-output rule. This map
  always validates them: the switch decides only whether a flagged row may be accepted.

---

## Generate: run and review

**Route:** `/generate/runs/:runId` · `views/generate/GenerateRunView`. The board has the states running,
failed and done.

**What the user can do**

- Header: "<base> to <target>", status badge, provider, chunk size, target file.
- Running: Pause finishes the current chunk and starts no new one. Stop and keep result ends the run, and
  finished keys stay in the review.
- Failed: a danger message with the provider's reason. Resume from chunk N. Stop and keep result.
- Done: status "Ready for review". Run again starts a new run with the same options.
- Progress: keys of total, chunk of total, elapsed time, estimated tokens, a bar, and one cell per chunk
  (done, running or failed, waiting) with a tooltip.
- A message says dry run is on and accepted translations stay in the list.
- Review: filter All or Needs attention with its count. Each row shows the base value, the key, an editable
  translation and an Accept checkbox. Clean rows start accepted, flagged rows start not accepted with a note.
  An edit validates again.
- Queued edits retain their run and locale when switching languages. Write and Run again wait for
  queued or in-flight row edits; an edit failure preserves the draft and prevents either action.
- Write N accepted: builds and applies a change set with the accepted rows.
- Automatic checks: placeholders, row count, identical to the base, keys unchanged, each with a result.
- Log: live.
- A renderer reload keeps the run. Quitting stops it cleanly, and nothing is half written.

**Engine use cases**

- Exists: chunking, the two API key strategies, merging into existing keys, row count warning.
- New: `generate.start`, `run.pause`, `run.resume`, `run.stop`, progress events, chunk validation with retry
  budget, stored chunk results, review list entries, `changes.apply`.

**IPC reads**

- `run.get`: status, provider, target, progress, checks, log so far.
- `changes.get`: rows with base value, key, translation, note, accepted.
- Events: `run.progress`, `run.log`, `run.finished`.

**Conflicts**

- The failed message says finished keys "were merged into the target file", the Keep partial results switch
  says the same, and the Runs sample logs it. That breaks "no partial write" and "all or none".
  `ResourceGenerator` did this, even with dry run on. A failed or stopped run now writes nothing, in the CLI and
  `run()` as well: finished keys stay in a pending change set, marked partial, and the message says they are safe in
  the review. Only a dry run keeps nothing.
- Write N accepted is the primary action while the board says dry run keeps everything in the list. This map
  disables it with the reason while dry run is on.
- The button is also drawn during a running translation. This map enables it only when paused, stopped,
  failed or done.
- Stop and keep result is drawn in all three states, and a paused state is not drawn. This map hides Stop
  when done and adds Paused with Resume.
- "The extra row was dropped" and the reference's "validate row count and retry" differ. Today all rows are
  kept with a warning. This map drops and reports rows with unknown keys, retries a chunk that misses or
  changes a key within the budget, and then fails the chunk, which never reaches the review.
- Generate allows several target locales, but this board shows one. This map runs one locale at a time with
  a locale switch in the header, which is not drawn.

---

## Test lab: translation

**Route:** `/test-lab/translation` · `views/test-lab/TestTranslationView`. The tab strip switches between the
three test lab boards.

**What the user can do**

- Compare two setups: provider and model, plus temperature for API key providers. Each shows duration,
  tokens and issue count after a run.
- Sample: N keys from a namespace, base to target. Run (Run again after the first time) calls both setups. A
  failing setup shows its failure in its own column.
- Result: base value and both results per key, with an issue note in a cell.
- Use setup A or B: goes to Generate with that setup.
- Try your own text: Add to sample adds it to this sample only.
- Nothing is written, and no change set is built.

**Engine use cases**

- New: `test.translate`, which calls the same `libs/backend/ai` path and validation without a change set. It may not
  grow a second implementation.

**IPC reads**

- `test.sample`: keys and values. `test.translate` result: per setup duration, tokens, issues, rows.
- `ai.providers`, `ai.models`.

**Conflicts**

- "Formal address, but the instructions ask for informal" cannot come from the automatic checks; it needs a
  model's judgment. This map shows placeholder, key and identical checks only. An AI check would be separate
  and labeled.
- The token count has no estimate label, against the reference, and a local assistant may report none. This
  map labels it and shows a dash when unknown.
- No sample picker is drawn. Generate's "10 keys" and this board's "7 keys" are one choice: this map adds a
  namespace picker and takes the size from where the user came.

---

## Test lab: detector

**Route:** `/test-lab/detector` · `views/test-lab/TestDetectorView`

**What the user can do**

- Preset: Angular, Lit, React, Vue, Stencil. Sample file tabs. The real detector for this file is named. Key
  prefix from the project.
- Paste your code: replaces the sample with the user's code.
- Source with line numbers, and lines with a match highlighted.
- Matches: position, match, type (Hard-coded or Key). None: empty state. Code the detector cannot parse shows
  the detector's failure.
- Extracted resource: the JSON the detector would produce.
- Nothing is written.

**Engine use cases**

- Exists: `preset.getParser(extension).detect(content, options)`, `KeyGenerator`, `JsonFormatter`.
- New: `test.detect` over pasted content, without files or a project scan.

**IPC reads**

- `test.detect` result: detector name, source lines, matches, extracted resource.
- `project.get`: prefix.

**Conflicts**

- The two sample tabs are `panel.html` and `panel.ts` for every preset, but `getParser` returns nothing for an
  extension the preset lacks, so Lit with `.html` would fail. This map derives the tabs from the preset's
  extensions.

---

## Test lab: key patterns

**Route:** `/test-lab/patterns` · `views/test-lab/TestPatternsView`

**What the user can do**

- Pattern: results update while typing. An invalid pattern marks the field and explains why. An empty entry
  says it matches no key.
- Examples: buttons that fill the field.
- Results: "N of M keys match", with every key marked as matching or not, using the project's real keys.
- Syntax: the reference table for exact keys, `*`, `**`, `?`, `{a,b}`, `*?` and `/expression/flags`.
- Add to used keys, Add to identical keys: go to Analyze with the configuration change prepared.

**Engine use cases**

- Exists: `KeyMatcher` with exactly this syntax, though `@internal` and not exported. The matcher copied into
  the board is not ported.
- New: `test.pattern` over the project's keys, `config.addException`.

**IPC reads**

- `test.pattern` result: error, match count, total, keys with match flag.

**Conflicts**

- Identical keys use another grammar. `createKeyPattern` knows only `*`, which crosses segments, while `{a,b}`,
  `?`, `**` and `/regex/` stay literal, and `--identical-keys` splits on every comma. Settings: project says
  so too. A pattern tested here can behave differently there. This map tests with the grammar of the chosen
  list until the owner moves identical keys to `KeyMatcher`, which changes what `loc.a.*.name` matches.
- "Nothing here writes to your project" sits above two Add buttons. This map assumes they only prepare a
  change set that is applied in Analyze.

---

## Rule packs

**Route:** `/rule-packs` · `views/rule-packs/RulePacksView`. The title bar shows no project.

**What the user can do**

- Add rule pack: opens the dialog. Available: Add opens the dialog with that pack filled in.
- In this workspace: packs with rule count and description. Click to select.
- Selected pack: Enabled in this workspace (locked for built-in rules). Table of rule, description, result,
  severity (Error, Warning, Off).
- Source and trust: source, version or pinned commit, content hash, update available. Access badges (declarative,
  reads catalogs, source code, network).
- Review update: shows the new commit and rule changes as a reviewable change to `wortlaut.lock.json`.
- A pack that fails verification against the lock file is disabled and says why. This state is not drawn.

**Engine use cases**

- Exists: `IAnalyzerRule` and the seven built-in rules.
- New: `rulePack.list`, `rulePack.available`, `rulePack.setEnabled`, `rulePack.setSeverity`, `rulePack.checkUpdate`,
  `rulePack.update`, lock file reading with fallback to `localizator.lock.json`, verification on load, a
  declarative rule evaluator, severity, the Message checks pack itself.

**IPC reads**

- `rulePack.list`: name, count, description, enabled, locked, rules (id, description, result, severity), source
  fields, access badges.
- `rulePack.available`: name, description.

**Conflicts**

- A pack belongs to a workspace on this board, but a workspace lives in the user's profile, while the lock file
  "pins for everyone" and its rules must work in the CLI, in Nx and in CI. This map assumes Add to a workspace
  writes configuration and lock into each repository of the workspace, one change set per repository.
- The title bar has no project, but the Result column needs one. This map shows the latest result per project,
  summed as "N projects failing".
- "Tone of voice" needs an assistant, "Angular templates" reads source code, and the reference allows only
  patterns, limits, messages and severities. This map does not offer them until the owner decides.
- `icu-syntax` and `placeholder-consistency` cannot be expressed as patterns and limits. This map assumes a
  fixed set of engine checks that a pack may name, such as ICU parsing, placeholder comparison and length ratio.
- "Terminology" is drawn under Available, and no such pack exists. Available lists what Wortlaut ships, which is Message
  checks until the owner adds more.
- The board has no place for a pack's content. This map keeps a copy of a fetched pack in `.wortlaut/rule-packs/<id>/` in the
  repository, next to the lock file, so CI needs no network and a tampered copy can be refused.
- A failed verification is not drawn. This map disables the pack, says why with both hashes, and offers Review update as the
  only way back.
- "Exit code by severity" would fail targets that pass today, whose findings never failed a run. This map applies it only to
  a repository with a lock file or severities.

---

## Add a rule pack

**Route:** `/rule-packs/add`, a dialog over Rule packs · `views/rule-packs/RulePackAddView`. Clicking outside or
pressing Escape does not close it.

**What the user can do**

- Where it comes from: GitHub, npm or Folder. The field follows; Folder also opens a native dialog.
- Check pack: fetches and parses without running anything. Shows name, commit, content hash, rules and "What this
  pack may do", derived from the rule definitions. Not found, not a pack and invalid definitions show inline.
- Add to: a workspace or only this project.
- "Same as": `npx wortlaut rules add <source>`, pinned in `wortlaut.lock.json`.
- Cancel closes. Install and pin: disabled until a check passed, then builds the change set, and the rules appear
  in Analyze.

**Engine use cases**

- New: `rulePack.check` (fetch from GitHub, npm without scripts, or a folder; schema validation; content hash),
  `rulePack.install`.

**IPC reads**

- `rulePack.check` result: name, commit, hash, rules, access, errors.
- `workspace.list`: for Add to.

**Conflicts**

- "A pack with code runs in a sandbox" contradicts "rule packs hold no code". This map rejects a pack with code at
  the check and removes the sentence.
- A folder has no commit, and a folder outside the repository cannot be "pinned for everyone". This map pins a
  folder by content hash and accepts only folders inside the repository for a shared pin.

---

## MCP and plugins

**Route:** `/mcp` · `views/mcp/McpView`. The title bar shows no project.

**What the user can do**

- What assistants may do: Read only, Propose changes or Write, with its explanation. `wortlaut mcp` reads the level.
  Without a level or a known project the server is read only.
- Status: "Server ready" means `npx wortlaut mcp` can start. No process runs in the app; it starts when an
  assistant connects.
- Connect an assistant: tabs Claude Code, Codex, Other MCP clients, with state and copyable steps.
- Tools: table of tool, description, level needed, "N of 12 available". Tools above the level are dimmed.
- Recent activity: tool, instant, client, result. All runs goes to Runs.
- Tools: `list_projects`, `get_config`, `search_keys`, `detect`, `analyze`, `test_pattern`, `next_translations`
  (read); `propose_translations`, `propose_keys` (propose); `apply_changes`, `transform`, `sort` (write).

**Engine use cases**

- Exists: the commands behind `detect`, `analyze`, `transform`, `sort`, and `KeyMatcher` behind `test_pattern`.
- New: all of `libs/backend/mcp`, level storage and enforcement, client name on each run, `next_translations` computed from
  catalog minus review list (no server state), `propose_*` running the same validation as `libs/backend/ai`.

**IPC reads**

- `mcp.status`: level, command, ready. `mcp.clients`: label, state, steps. `mcp.tools`: id, description, level.
- `run.list` filtered to MCP: tool, instant, client, result.

**Conflicts**

- The review list has no board, route or sidebar entry, although `propose_*`, `changes list` and `changes apply`
  all depend on it. An MCP proposal cannot be approved in the app as drawn. This map assumes a new `/changes` view
  reusing the review table of Generate: run and review. It needs a design.
- "Write to catalogs directly" contradicts "no surface writes directly". This map assumes the Write level
  approves its own change set automatically, and every change appears in Runs.
- "They get the same commands as the app", but no `generate` tool is listed. This map keeps the 12 tools: the
  assistant translates through `next_translations` and `propose_translations`.
- `npx -y @pixel-brewery/wortlaut-app mcp` fails on a clean machine: GitHub Packages needs a token even for public
  packages. The owner decides between another registry and a documented `.npmrc` step. Until then the screen shows the command
  line next to the app, says that the plugin needs the published package, and calls the server ready only when that command line
  and Node.js are found.
- The "Installed" badge needs a way to see an assistant's setup without reading credentials. Synapse cannot say whether a
  server is connected, so the badge says Installed when `AssistantLocator` finds the command, and Connected only once a run of
  that client through MCP is on record.

---

## CLI and Nx

**Route:** `/cli-nx` · `views/cli-nx/CliNxView`

**What the user can do**

- Settings tab: Effective settings of the project: setting, value and source (`nx.json targetDefaults`,
  `wortlaut.lock.json`, `.env`, configuration, This run). `{env.NAME}` stays unresolved in the display.
- Source file: the file itself. Open in editor opens it outside the app.
- Nx tab: targets found through `@pixel-brewery/nx-tasks:localizator`, a copyable command per configuration, all
  projects, and scripts from `package.json`. Nothing changes in the user's setup.
- Projects without Nx: the same settings in `wortlaut.config.json`, with the same schema as the executor options.
- Commands tab: filter, table of app action and command. Every listed command exists and runs.
- `--json` on every command for scripts and CI.

**Engine use cases**

- Exists: `detect` (no flags yet), `analyze`, `generate`, `sort`, `transform`, `info`; `run()` as the Nx entry.
- New: all configuration file reading (no file is read today), resolution with sources, `init`, `config get` and
  `set`, `workspace list` and `add`, `project list`, `rules list`, `add` and `update`, `ai status`, `changes list`
  and `apply`, `mcp`, `--json`, a JSON schema for the configuration.

**IPC reads**

- `config.getEffective`: setting, value, source, for the project. `config.getSourceFile`: name, text.
- `nx.targets`: label, command. `cli.commands`: action, command.

**Conflicts**

- `resourceRoot` has two meanings. `run()` resolves it below `root`, while `--resource-root` resolves from the
  working directory, so `--resource-root assets/i18n` here and the Nx sample point at different folders. The
  boards' samples also disagree (`libs/intl/...` and `../../../libs/intl/...`), and Settings: project says all
  paths are relative to the working directory. This map resolves paths once in the engine, keeps executor options
  root-relative for compatibility and prints "Same as" lines relative to the working directory.
- `run()` joins several `resourceRoot` entries into one path, and the design wants several roots. The engine keeps
  the joined path when it exists, as targets may rely on it, and reads the entries as several roots otherwise.
- No file was read before, so `nx.json` could change what an existing script writes. A call that names its catalogs
  with `--resource-root` therefore reads no Nx file, only `wortlaut.config.json`, its fallback and its arguments.
  `run()` reads no file at all, because Nx has merged the options already. A call without `--resource-root` could
  only fail before, so it gets the whole resolution.
- "Every action in the app has a command", but the table has none for the test lab, run history, key edits, key
  merges or workspace export. The owner decides whether to add them or soften the sentence.
- The architecture's resolution order leaves out Nx configurations, `.env` and the lock file. This map places
  configurations after `project.json`, uses `.env` only to fill tokens, and shows the lock as the source of packs.
- "Runs from Nx also appear in Runs" holds only for real executions and only where a user profile exists. A cache
  hit runs nothing, and CI has no profile. Parallel `run-many` writers need a safe store.
- `output` in the `nx.json` sample is not read by today's executor or `run()`. This map treats it as sample only.

---

## Runs

**Route:** `/runs`, `/runs/:runId` · `views/runs/RunsView`

**What the user can do**

- List: command, state badge, details, surface (Desktop app, Claude Code via MCP, Nx, CLI), dry run tag, instant.
  Click to select. No runs yet: empty state.
- Details: title, instant, duration, summary, and the equivalent command.
- Copy command: without secrets. Run again: repeats the stored options as a new run under the current dry run.
- Log tab: the retained log in bounded text pages. Configuration tab: the options used, without secrets,
  through the same text pager.
- Changes tab: file and what happened to it, or "No files" with the reason.

**Engine use cases**

- New: `run.list`, `run.get`, `run.repeat`, the run store (bounded, UTC instants, options without secrets, one
  entry per run so several processes can write), recording from the CLI, `run()` and MCP.

**IPC reads**

- `run.list`: title, state, surface, dry run, instant, detail.
- `run.get`: duration, command, log, changes, configuration.

**Conflicts**

- The sample of a stopped `generate` writes 310 keys into the target file. This map follows the conflict under
  Generate: run and review.

---

## Settings: workspace

**Route:** `/settings/workspace` · `views/settings/SettingsWorkspaceView`

**What the user can do**

- Workspace: name, short code, color.
- Folders: repositories as closable chips (closing removes them from the workspace only). Add folder opens a native
  dialog. Scan for projects on or off.
- Shared defaults: base locale, target locales, framework preset, AI assistant, count of enabled rule packs, with
  Manage rule packs.
- Where it runs: This computer. Cloud is disabled with "Later".
- Move a workspace: Export workspace saves settings and pinned packs through a native dialog, with no keys or logins.
  Import workspace reads such a file and shows what it adds.
- Remove workspace: asks first; the user's files stay where they are.
- Discard and Save changes: enabled only when dirty.

**Engine use cases**

- New: `workspace.update`, `workspace.remove`, `workspace.export`, `workspace.import`, `project.discover`.

**IPC reads**

- `workspace.get`: name, code, color, repositories, scan flag, defaults, pack count.

**Conflicts**

- "Projects inherit these values" cannot hold. Workspaces live in the profile, and the resolution order and "the CLI
  and Nx keep working without the app" allow only repository files, so a CLI run would differ from the app. This map
  uses shared defaults only to fill in new projects at setup, written into the repository. They never join
  resolution.
- The preset list leaves out Stencil and the assistant list leaves out Codex. This map takes both from the engine.
- Pinned packs live in each repository's lock file, not in the workspace. This map exports references only.
- The file names no folders, because a file from somewhere else must not gain access to a path. The user chooses each repository at
  import, and the scan finds its projects.

---

## Settings: project

**Route:** `/settings/project` · `views/settings/SettingsProjectView`

**What the user can do**

- Project: working directory, source root, resource roots (chips, Add folder), framework preset, resource format.
- Keys: prefix, suffix.
- Locales: base locale, target locales (chips, Add locale).
- Analyzer defaults: Rules to run as checkboxes, Used keys, Identical keys, Identical values as chips with Add.
- Discard and Save changes. Save builds a change set against the file each value comes from, so it is a normal diff
  in the repository. An inherited value becomes an override in `project.json` and never changes a shared default
  silently.
- Path fields use native dialogs and stay inside the project's root.

**Engine use cases**

- Exists: every value as a command option.
- New: `config.getEffective`, `config.set` with a minimal diff in the source file, several resource roots through
  `run()` (it joins the entries into one path today), keeping nested or flat JSON (the serializer always nests).

**IPC reads**

- `config.getEffective`: value and source of each field.
- `analyze.rules`: built-in rule ids and state. `project.get`: discovered locales.

**Conflicts**

- Every text field is drawn read-only, yet the card has Save changes. This map makes them editable, paths through
  native dialogs. The same goes for Settings: AI.
- Resource format offers TypeScript as a format to read, but no TS reader exists and it is not a `ResourceMode`. This
  map offers JSON, RESX and PO, and adds PO to the CLI's `--type`.
- The preset list leaves out Stencil. This map takes it from the engine.
- Target locales are "found from the file names" and also closable, so a closed locale would come back on the next
  scan. This map assumes locales declared in configuration win over discovery, and closing one never deletes a file.

---

## Settings: AI

**Route:** `/settings/ai` · `views/settings/SettingsAiView`

**What the user can do**

- Assistants: Claude Code, Codex, OpenCode with state. Check login asks Synapse and starts no login. Show how to
  install shows text and installs nothing. There is no chat in Wortlaut.
- API keys: OpenAI and Google Gemini with state. Set a key, Test connection, clear a key. The renderer learns only
  whether a key exists.
- Defaults: default assistant, model (listed from the selected provider), temperature (API key providers only), chunk
  size, limit (empty means none). A run can change them.
- Instructions: for all locales, and one field per locale.
- Safety: Review before writing, Protect placeholders, Keep partial results, Keep raw AI output.
- Discard and Save changes.

**Engine use cases**

- Exists: temperature, chunk size, limit, instructions as generator options, and API key strategies.
- New: `ai.providers`, `ai.checkLogin`, `ai.installHint`, `ai.setKey`, `ai.clearKey`, `ai.testKey`, `ai.models`,
  `config.aiDefaults`, per-locale instructions, raw output as an option (`dumpResult` always writes today).

**IPC reads**

- `ai.providers`: id, name, kind, state, description. `ai.models`: per provider.
- `config.aiDefaults`: defaults, instructions, safety flags.

**Conflicts**

- The key field shows a stored value with a reveal button, but the renderer can never read a key back. This map
  shows a fixed "Saved" mask, lets the user reveal only what they are typing, and adds a Clear button, which is not
  drawn.
- Keep partial results says finished keys are merged into the target file. This map reads it as keeping them in
  the change set, as under Generate: run and review.
- "Write directly, like the CLI" contradicts "every write is a change set". This map treats it as automatic approval.
- Protect placeholders "flags" here and "rejects" on Generate. This map uses the Generate conflict's meaning.
- The workspace "owns" AI connections, but keys and logins belong to the computer, and CLI parity needs instructions
  in the repository. This map stores keys in the keychain, default provider in the profile, and model, chunk size,
  limit and instructions in repository configuration.
- The default assistant list leaves out Codex. This map takes it from the engine.

---

## Settings: application

**Route:** `/settings/application` · `views/settings/SettingsAppView`. Changes apply immediately; there is no Save.

**What the user can do**

- Start in dry run: sets the title bar switch at launch, on by default. Verbose log: maps to `debug`. Cache results:
  reuses results of files that did not change. Cache folder: `.wortlaut/cache`, relative to the working directory.
- Color mode: Light or Dark, in Soho. Interface language.
- Keyboard shortcuts: search (⌘K), run the current command (⌘Enter), suggest with AI (⌘J), next open finding (⌘↓).
  All really work, and with Ctrl on Windows and Linux.
- Command line and CI: copy `yarn add @pixel-brewery/wortlaut-app`. Export run configuration saves the effective
  settings through a native dialog, without secrets. Open CLI and Nx.
- Environment: Wortlaut version, platform, arch, CPUs, RAM. Copy for bug report.

**Engine use cases**

- Exists: `info`.
- New: `app.getSettings`, `app.saveSettings`, the result cache (`run()` honours `cache`), `config.exportRun`.

**IPC reads**

- `app.getSettings`: flags, cache folder, mode, language. `app.getInfo`: version, platform, arch, CPUs, RAM.

**Conflicts**

- Interface language offers German and French, but the reference fixes English, and product copy is English. This map
  leaves the control out until the owner decides.
- "A setup that works here also works in a pipeline" fails for local logins and keychain keys. This map keeps the
  sentence true through `wortlaut ai status` and keys from the environment, and says so in the CLI's output.
- The cache folder sits in the user's repository. `wortlaut init` adds it to `.gitignore` through its change set. It holds only what can
  be worked out again, so it is the one write outside of a change set: it ignores itself in Git, and with Dry run on it is read and not
  written.
- Color mode has no way back to the system on the board. The app follows the system until the user picks a mode.

---

## Shell: titlebar

**Route:** none, part of every view after the start screens · `views/shell/TitlebarView`

**What the user can do**

- Workspace crumb: code, color, name; goes to Workspaces. Project crumb: goes to Projects, hidden when no project
  is open.
- Search keys, files and commands (⌘K): results open the key, file or view.
- The search palette follows the Symphony command-palette composition: a dimmed backdrop and a
  viewport-bounded card, with a fixed search header and keyboard-hint footer around scrolling result
  groups. Typing keeps focus in the field, arrows select a result, Enter opens it, and Escape or the
  backdrop closes the palette and restores focus. Tab stays inside the search field.
- Provider button: shows the active provider; goes to Settings: AI. None set up: says so.
- Dry run: the visible switch. The state lives in main and starts from Settings: application. It applies to commands
  started from the app. A running run keeps the value it started with.
- The window dots are the native window controls.
- Free title-bar space moves the native window and supports the operating system's double-click
  behavior. Breadcrumbs, search and title-bar controls remain interactive; window edges resize natively.

**Engine use cases**

- New: `search.query`, `app.getDryRun`, `app.setDryRun`, active provider from `ai.providers`.

**IPC reads**

- `shell.state`: workspace, project, active provider, dry run. `search.query`: grouped results.

**Conflicts**

- The Runs sample tags an MCP run as "dry run", but another process cannot see this switch. This map lets the MCP level
  decide for MCP and the flag for the CLI, and drops that tag for tools that never write.

---

## Shell: sidebar

**Route:** none, part of every view after the start screens · `views/shell/SidebarView`

**What the user can do**

- Workspace: Projects (`/projects`), Rule packs (`/rule-packs`).
- Project: Overview (`/overview`), Translations (`/translations`).
- Commands: Detect (`/detect`), Analyze (`/analyze`), Generate (`/generate`), Transform and sort (`/transform`).
- Verify: Test lab (`/test-lab/translation`), Runs (`/runs`).
- Connect: MCP and plugins (`/mcp`), CLI and Nx (`/cli-nx`).
- Settings (`/settings/workspace`). The active item follows the route.
- The footer shows Wortlaut and the real version.

**Engine use cases:** none.

**IPC reads**

- `app.getInfo`: version. `shell.state`: whether a project is open.

**Conflicts**

- The Projects, Rule packs and MCP boards have no project, but the sidebar still offers project items. This map
  disables project, command and verify items until a project is open, which is not drawn.

---

## New capabilities and owners

Schemas and types for all of these live in `libs/contracts`.

| Capability | Owner | Boards |
| --- | --- | --- |
| Command use cases over core and AI, with injected logger and progress events | `libs/backend/engine` | Detect, Analyze, Transform and sort, Generate: run and review, Projects in a workspace, MCP and plugins |
| Change sets: build, diff, persist, recheck, write all or none | `libs/backend/engine` | Detect, Analyze, Translations, Transform and sort, Generate: run and review, Settings: project, Rule packs, Add a rule pack, Runs |
| Review list: stored pending change sets, shared between processes | `libs/backend/engine` | Generate: run and review, MCP and plugins, CLI and Nx; needs a board |
| Run store: every surface, bounded, safe for several writers, repeatable | `libs/backend/engine` | Runs, Overview, MCP and plugins, CLI and Nx, Projects in a workspace |
| Configuration resolution with a source per value (`nx.json`, `project.json`, configurations, `wortlaut.config.json`, `localizator.config.json`, `.env` tokens, arguments) | `libs/backend/engine` | CLI and Nx, Projects in a workspace, Settings: project, Settings: AI, Runs |
| Configuration writes with a minimal diff in the source file | `libs/backend/engine` | Settings: project, Settings: AI, Analyze, Test lab: key patterns, Project setup |
| One path resolution for `root` and `resourceRoot`, several resource roots | `libs/backend/engine` | CLI and Nx, Settings: project |
| Folder inspection and project discovery by executor, configuration or catalogs | `libs/backend/engine` | Welcome, Project setup, Workspaces, Settings: workspace |
| Workspaces in the profile: create, change, remove, recent, export, import | `libs/backend/engine` | Welcome, Workspaces, Settings: workspace, Project setup, Shell: titlebar |
| Project summary: coverage, namespaces, next steps, last results | `libs/backend/engine` | Overview, Workspaces, Projects in a workspace |
| Catalog queries: namespaces, search, filters, key detail | `libs/backend/engine` | Translations, Overview, Transform and sort, MCP and plugins |
| Catalog edits: set value, set comment, merge keys, delete key | `libs/backend/engine` | Translations, Analyze, Overview |
| Detect apply: source and catalog in one change set | `libs/backend/engine` | Detect |
| Multi-project runner | `libs/backend/engine` | Projects in a workspace |
| Rule packs: fetch, check, access summary, install, pin, update, verify, available list | `libs/backend/engine` | Rule packs, Add a rule pack, CLI and Nx |
| Rule settings: severity, per-rule exceptions, per-run selection | `libs/backend/engine` | Analyze, Rule packs, Settings: project |
| Test lab use cases over the same paths | `libs/backend/engine` | Test lab: translation, Test lab: detector, Test lab: key patterns |
| Command printer for "Same as" and Copy command | `libs/backend/engine` | Detect, Transform and sort, Generate: set up, Add a rule pack, Runs, Projects in a workspace |
| Result cache, run configuration export, search across keys, files and commands | `libs/backend/engine` | Settings: application, Shell: titlebar |
| Local assistant strategies through Synapse (`claude-code`, `codex`, `opencode`) | `libs/backend/ai` | Generate: set up, Project setup, Settings: AI, Test lab: translation |
| Chunk validation: row count, keys, placeholders, retry budget, report per chunk | `libs/backend/ai` | Generate: run and review, Test lab: translation, MCP and plugins |
| Generator without writes: results returned, partial merge removed, raw dump optional | `libs/backend/ai` | Generate: run and review, Settings: AI, Runs |
| Pause, resume, stop and progress per chunk | `libs/backend/ai` | Generate: run and review |
| Key scopes: all, new, missing, namespace, explicit keys | `libs/backend/ai` | Generate: set up, Analyze |
| Token estimate, prompt preview, per-locale instructions, model list, key test | `libs/backend/ai` | Generate: set up, Settings: AI, Test lab: translation |
| AI proposals: value suggestion, key names, key patterns | `libs/backend/ai` | Translations, Detect, Analyze |
| `.tsx` in the React preset, skip test files in detect, generated keys with prefix and suffix | `libs/backend/core` | Detect, Test lab: detector |
| Source rewrite at a detected position, per detector | `libs/backend/core` | Detect, Analyze |
| Key usage with file and line, reuse hints by base value | `libs/backend/core` | Translations, Detect, Analyze |
| Catalog writer that keeps order and nested or flat JSON, PO formatter, finished PO, comment sidecar | `libs/backend/core` | Translations, Detect, Transform and sort, Settings: project |
| Findings in one shape, severity on rule results, shared placeholder extraction | `libs/backend/core` | Analyze, Rule packs, Translations, Generate: run and review |
| Declarative rule evaluator with named checks (ICU parsing, placeholders, length ratio, punctuation) | `libs/backend/core` | Analyze, Rule packs, Add a rule pack |
| `KeyMatcher` public; one grammar decision for identical keys | `libs/backend/core` | Test lab: key patterns, Analyze, Settings: project |
| MCP server and the 12 tools | `libs/backend/mcp` | MCP and plugins, CLI and Nx |
| Levels: storage, enforcement, read-only default, client name on runs | `libs/backend/mcp` | MCP and plugins, Runs |
| Claude and Codex plugins: server and skill, no logic | `libs/backend/mcp` | MCP and plugins |
| Electron shell: sandbox, single instance, typed IPC, preload | `apps/desktop` | all boards |
| Native dialogs, root checks, folder drop | `apps/desktop` | Welcome, Project setup, Workspaces, Settings: workspace, Settings: project, Add a rule pack, Settings: application |
| Keys through `safeStorage`: set, test, clear, exists | `apps/desktop` | Project setup, Settings: AI |
| Synapse host: provider composition, login state, install hints | `apps/desktop` | Settings: AI, Generate: set up, Project setup, Translations |
| Run hosting in main or a utility process, awaited shutdown | `apps/desktop` | Generate: run and review, Projects in a workspace, Detect, Analyze |
| App settings, dry run state, open in editor, app information | `apps/desktop` | Settings: application, Shell: titlebar, CLI and Nx, Analyze, Shell: sidebar |
| Push events when another process changes the review list or runs | `apps/desktop` | MCP and plugins, Runs |
| Shell, routes, ⌘K palette, shortcuts, Soho in light and dark | `libs/frontend` | Shell: titlebar, Shell: sidebar, Settings: application |
| One view and presenter per board, with all four states | `libs/frontend` | all boards with a route |
| Shared review table and the review list view | `libs/frontend` | Generate: run and review; needs a board for MCP proposals |
| Rename to `wortlaut`, keep the `localizator` binary alias and `run()` | `apps/cli` | CLI and Nx |
| Missing flags: detect options, `--instructions`, `--limit`, `--type po`, key scope, new strategies | `apps/cli` | Detect, Generate: set up, CLI and Nx, Settings: project |
| New commands: `init`, `config`, `workspace`, `project`, `rules`, `ai status`, `changes`, `mcp` | `apps/cli` | CLI and Nx, Add a rule pack, MCP and plugins |
| `--json`, exit code by severity, keys from the environment, runs recorded | `apps/cli` | CLI and Nx, Generate: set up, Runs, Rule packs |

## Suggested build order

Each phase ends in something that runs.

1. **Move and rename.** `libs/backend/core`, `libs/backend/ai` and `apps/cli` under the new names, with the `localizator` alias, `run()`
   and today's tests. Register the missing flags and fix `.tsx`. *Runs:* `wortlaut` and `localizator` produce the same
   files as 0.1.185 on a fixture.
2. **Engine foundation.** `libs/backend/engine` with `libs/contracts`: command use cases, configuration resolution, path
   resolution, change sets, review list, run store. The generator stops writing. Add `init`, `config`, `changes`,
   `--json`. *Runs:* `wortlaut sort --review` builds a change set, `wortlaut changes apply` writes it, and the run is
   recorded. Without the option, `wortlaut sort` applies straight away and writes what it always wrote.
3. **Desktop shell, read-only.** `apps/desktop`, `apps/frontend/app`, `libs/frontend`, typed IPC, Welcome, Project setup, Workspaces, Projects
   in a workspace, Overview, Runs, Settings: workspace and project, CLI and Nx, both shell boards. *Runs:* a real
   repository opens, Overview shows real values, and effective settings show their sources, in light and dark.
4. **Commands in the app.** Detect with source rewrite, Analyze with exceptions, Transform and sort, Translations, the
   review list view, Test lab: detector and key patterns. *Runs:* scan, fix a string, allow a finding, sort and apply
   without AI.
5. **AI.** Keychain, API key providers, Synapse, validation, Generate: set up, run and review, pause and resume, Test
   lab: translation, Settings: AI, AI suggestions. *Runs:* translate a locale with Claude Code, review, apply; quitting
   mid-run leaves nothing written.
6. **Rule packs.** Evaluator, Message checks pack, lock file, Rule packs, Add a rule pack, `wortlaut rules`. *Runs:* a
   pack from a folder and from GitHub gives the same findings in the app and the CLI, and a changed hash is refused.
7. **MCP and plugins.** `libs/backend/mcp`, levels, `wortlaut mcp`, MCP and plugins, the two plugins. *Runs:* Claude Code proposes
   translations, they appear in the review list, and approval writes them.
8. **Fleet and polish.** Run on all projects, result cache, workspace export and import, ⌘K, shortcuts, run configuration
   export, packaging. *Runs:* an installed app analyzes all projects of an Nx workspace.
9. **Mosaik integration.** Mosaik does not use Wortlaut itself, so the executor and the resource rules leave it: Wortlaut publishes
   them as `wortlaut-nx-tasks` and `wortlaut-eslint-rules`, the consumer repositories move, and Mosaik removes `tools/localizator`,
   its executor, its Vite plugin and its resource rules. *Runs:* the consumer repositories' real targets work on the released packages.
