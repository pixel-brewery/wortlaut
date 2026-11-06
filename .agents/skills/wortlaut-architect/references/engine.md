# Engine

Read [the base backend module](../../architecture/references/common/backend.md) and
[integration safety](../../architecture/references/common/backend-safety.md) with this page.

## Commands

`detect`, `analyze`, `generate`, `transform`, `sort` and `info` are use cases of
`libs/backend/engine` over `libs/backend/core` and `libs/backend/ai`. Each takes a resolved project and options and
returns a result the surfaces present. They log through an injected logger, never to the
console, and report progress as events.

The CLI's behavior is the compatibility baseline: a command must not lose an option it
has, and a CLI run and an Nx run of the same configuration produce the same files.

## Change sets

A change set lists files with their old and new content, the source of the change and its
findings. Applying one rechecks that each file is still what was read, and writes all of
it or none of it. A file that changed meanwhile fails the apply and names the file.

Surfaces that name projects by id go through `ProjectCommands`, which resolves the options, runs the use case and hands back
what a view shows. With dry run on, a control that writes leaves its change set in Review, and a command that only reads runs
as a dry run. A source rewrite replaces a value at the position its detector found; the scan keeps the hash of each file, so a
file that changed since fails the apply and names the file.

An apply writes a journal to `journal/` of the profile before it touches a file: `preparing` while it stages, `committing` with a copy
of each file before the first rename. `ChangeSetRecovery` runs when an engine starts, for every journal whose process is gone: with all
new content on disk it finishes the change set and takes it out of the review list, otherwise it restores the files and the set stays
pending. A file that is neither what was read nor what was written belongs to somebody else: it stays and is named. Renaming a journal
decides who recovers it, and each recovery records a run `changes.recover`. A profile that cannot be written has no journal.

## Result cache

`ResultCache` keeps results of work that depends only on what its key names, in `.wortlaut/cache` of the working directory. The key holds
what identifies the tool, the kind of work and every input as content, never a time stamp. Detect keeps what a detector finds per file.
Analyze keeps a rule per catalog, keyed on what was parsed, the settings a rule reads, what the sources use and the hash of every pack;
a rule outside of `SINGLE_CATALOG_RULES` also depends on every catalog. A rule a time limit stopped stays out. The folder holds only what
can be worked out again, so it is the one write outside of a change set: it ignores itself in Git, a link out of the working directory is
refused, and only a run with `writeMode` `apply` writes it. A dry run reads it. A run without a tool or without `cache` has no cache.

## Run on all projects

`ProjectCommands.runConfigured` runs a command from what a project configured, and `configuredInput` works that out for Generate: what the
target locales still miss, with a provider that is ready. A run gets `collectChanges` and writes nothing itself. `writeBatch` then merges
what all of them collected into one change set per repository, all or none, and each run keeps its record with its own files. A stopped
batch or a partial result never writes: it waits in Review.

## Search and moving a workspace

`SearchService` looks through the keys and files of a workspace, the open project first. A file leaves as an id, so no request names a
path. `WorkspaceTransfer` writes and reads `WorkspaceExportSchema`: settings, repository names and references to pinned packs, never a key,
a login or a path. A file is untrusted: it is checked and shown before anything changes, adding it creates a new workspace, the user
chooses each folder in a native dialog, and a pack only joins when its source gives the pinned hash, as one change set per repository.

## Configuration and projects

A workspace is a named group of repositories and shared defaults in the user's profile.
A project is found by its `localizator` target or configuration file, or set up by
hand. Resolution records the source of every value. Paths stay inside the project's root
unless the user chose them through a native dialog.

## Rule packs

A pack comes from GitHub, npm or a folder and contains declarative rules: patterns,
limits, messages and severities. Loading it runs none of its content. The engine verifies
its commit and content hash against `wortlaut.lock.json`, and an update is a reviewable
change to that file. Built-in rules and pack rules share `IAnalyzerRule`.

The definition is `wortlaut-pack.json` at the root of the pack, in `RulePackManifestSchema`: every rule has exactly one of a pattern, a
limit or a named check of the engine (`icu-parsing`, `placeholder-comparison`, `length-ratio`, `punctuation`). The content hash covers
that file, so a folder, a repository and a package with the same file have one hash. `RulePackService` fetches and checks; it pins a
copy of a fetched pack in `.wortlaut/rule-packs/<id>/`, so an analysis needs no network, and a folder inside the repository by its hash
alone. `RulePackLoader` verifies on every load and a mismatch is a refusal. Archives are read in memory under `PACK_LIMITS`, and a
path that leaves the pack, a link or code refuses the whole pack. A regular expression of a pack runs only through `PatternGuard`,
which bounds every test with a timeout V8 enforces inside the match, and all patterns of one analysis share a budget. Text of a pack
holds no control characters, because it reaches a terminal. A surface passes a change through a change set per repository.

The severity of a rule lives in `actions.analyze.severities` of the project's configuration, where `off` means it does not run. A
report only says more when a repository has a lock file or severities: otherwise findings stay `error` and the exit code stays 0, as
it always was. `explicitRules` marks rules that one run asked for: exactly those run, and otherwise the rules of the packs run next to
the configured list.

## Runs

Every command from any surface in the app's reach records a run: command, surface, options
without secrets, duration, log, findings and the change set. Instants are UTC; the renderer
formats them. History is bounded, and a run can be repeated from its stored options.

## Test lab

The test lab calls the same detectors, patterns and translation paths on samples and never
writes to the project. It may not grow a second implementation of them.

## Assistants

`AssistantCommands` is what the MCP server asks of the engine, and it holds no state. `next_translations` plans along the path of
Generate and takes out the keys that pending change sets would change, read with `CatalogEditor.entriesOf`. `propose_translations`
checks with `validateChunk` and leaves `ProposeTranslationsUseCase` in `review`, on top of an earlier proposal for the same catalog
that still fits what is on disk. `propose_keys` holds names to `checkKeyName` and goes through `applyDetect`.

## Generate of the app

`GenerateService` works out what a setup would take, runs it as one recorded run and keeps its review. `TranslationSession` holds
a run while it goes on and while its review stays open, and `TranslationRunUseCase` turns its end into a change set: applied,
pending, or pending and partial for a stopped or quit run. Write N accepted is a change set of its own, but no run of its own: with
`continuesRun` it joins the record of the translation, which keeps its duration and takes over the log and the files. A target
that changed since the run read it fails that write and names the file. `wortlaut.comments.json` holds the comments of a JSON project.
