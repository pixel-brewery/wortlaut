# Surfaces

Read [the base contracts module](../../architect/references/common/backend-contracts.md)
with this page.

## CLI

`apps/cli` publishes `@pixel-brewery/wortlaut-app` with the `wortlaut` binary. It keeps a
`localizator` binary as an alias, and `run()` stays the programmatic entry that the Nx
executor calls. Errors in arguments exit non-zero. By default a command applies its change
set; `--dry-run` only reports it and `--review` leaves it for `wortlaut changes apply`. With
`--json`, stdout holds one document and everything else goes to stderr. `--cache` and `--cache-dir` reuse results for `analyze` and
`detect`, as `cache` of `run()` does; both are off by default and change no result. `generate` takes the assistants
`claude-code`, `codex` and `opencode` with their own login, and API keys from the environment or `--api-key`, never from
the keychain of the app. `wortlaut ai status` reports every provider and starts no login. `wortlaut rules` takes the path the app takes. `analyze` exits with 1 for
a finding of severity `error` or a refused pack only once a repository has a lock file or severities, and `run()` hands the same as
`gate`.

## Compatibility

Existing consumer repositories use the old names. They must keep working until their owners
move them, so these stay supported without a warning that fails a build:

- the `localizator` binary and the `localizator` executor of `@pixel-brewery/wortlaut-nx-tasks`
- `@pixel-brewery/nx-tasks:localizator` in Mosaik, for a repository on a version that still has it
- `localizator.config.json` and `localizator.lock.json` as fallbacks
- the option names of the executor

## Nx

`libs/backend/nx-tasks` publishes `@pixel-brewery/wortlaut-nx-tasks`. Its executor `wortlaut` calls `run()` of the app package and
holds no logic beyond choosing the command and logging. A target fails like the command line: for anything that kept the run from
finishing, and for `gate`. `ConfigurationResolver` matches any `nx-tasks:wortlaut` or `nx-tasks:localizator`, so the app finds a
target under the old and the new name.

## ESLint

`libs/backend/eslint-rules` publishes `@pixel-brewery/wortlaut-eslint-rules`, with the rules `wortlaut/*` over the analyzer rules of
the core package and `createResourcesConfig` for the translation files of a project.

## MCP

`libs/backend/mcp` exposes the engine's use cases as 12 tools, started by `wortlaut mcp` over stdio. The logic lives in
`AssistantCommands` of the engine, on the paths of the app and the command line, and the server only checks and hands over. Every
input is a strict schema and no tool takes a path: a project is an id from `list_projects`, or the known project the server was
started in. `restrictToKnownRoots` makes the engine refuse any change set outside of the folders the user chose, links resolved.

Each tool has a level: read, propose or write. The user sets it in the app and it lives in `mcp.json` of the profile. It is read
for every call, and the server is read only without a level or a known project. No argument of the server or of a tool reaches
it, and what a client says about itself decides nothing: its name only labels the run. A tool above the level is refused with a
message, however the client came to call it. `tools/list` shows only what the level allows and says when that changed.

A proposal runs `validateChunk` and lands in the review list as a pending change set, and proposals for one catalog share one
set, so approving it leaves no conflict behind. `next_translations` is the catalog minus the review list, worked out every time.
The Write level applies its own change sets, through the check of Approve. It does not see the Dry run switch of the app, which is
another process: only a call's own `dryRun` makes a real dry run, which stores nothing.

The server composes no AI provider. Stdout belongs to the protocol: `reserveStdoutForProtocol` sends everything else to stderr, and
`wortlaut mcp` runs outside the `Program` of the other commands, which prints to stdout when a command ends. Results pass the
scrubber, which removes options named like a secret and the values of secret variables of the environment. Each call records a run
with its client, tool and result. Reads of an assistant have an id ending in `-read` with a bound of their own in the run store,
so they cannot push the commands of the user out of the history. The app learns of them through `ProfileWatcher`.

## Plugins

The Claude and Codex plugins in `libs/backend/mcp/plugins` carry the MCP server and a skill that explains the workflow. They hold no
logic of their own. Claude reads `.claude-plugin/plugin.json` and `.mcp.json`, and the marketplace is `.claude-plugin/marketplace.json`
at the root; check them with `claude plugin validate`. Codex reads the portable `plugin.json` and `mcp.json`, whose servers name their
`type`, and the marketplace is `.agents/plugins/marketplace.json`; Codex starts a plugin's server in the folder of the plugin, so the
skill names projects by id. A plugin starts the published package, so it works once `@pixel-brewery/wortlaut-app` can be fetched.

## Mosaik integration

Mosaik does not use Wortlaut itself. It only handed the tool on through `infra/nx-tasks`,
`infra/vite-plugins` and `infra/eslint-rules`, so that part leaves Mosaik, in this order:

1. Wortlaut publishes the Nx executor and the ESLint rules.
2. The consumer repositories move to `@pixel-brewery/wortlaut-nx-tasks:wortlaut` and run their real targets.
3. Mosaik removes `tools/localizator`, its `localizator` executor, its Vite plugin, which no repository uses, and its
   resource rules. Its other executors and its code style rules stay.

Until then `tools/localizator` in Mosaik stays untouched.

Check [the base platform module](../../architect/references/common/platform.md) before
changing the published surface of a package these owners depend on.
