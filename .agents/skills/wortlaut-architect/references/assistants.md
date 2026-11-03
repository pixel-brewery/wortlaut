# Assistants

Read [the base platform module](../../architecture/references/common/platform.md) and
[integration safety](../../architecture/references/common/backend-safety.md) with this page.

## Providers

Two paths lead to a translation, behind one strategy interface in `libs/backend/ai`:

- **Local assistants through Synapse:** Claude Code, Codex and OpenCode with their own
  login, so no API key is needed. Synapse owns the native CLI protocols and accounts.
  Wortlaut does not install a CLI, start a login or read its credentials.
- **API keys:** OpenAI and Google through the AI SDK, as the tool does today.

Never call an assistant "not installed" because it is not on a `PATH`. An app started from the dock barely has one, and
Codex often lives only inside the ChatGPT or Codex application. `AssistantLocator` knows these places, the same way Symphony
and Resonanz do.

Only `apps/desktop` and `apps/cli` choose and compose a provider. The strategies receive it, so engine code stays testable
with a fake. `libs/backend/mcp` composes none: an assistant at the other end of MCP translates by itself, and the server can
start no provider or model on its own.

## Model output

Model output is untrusted. Validate its shape and row count, keep placeholders intact and
retry within a budget. A bad chunk is reported and does not reach a catalog. All results
stay proposals in a change set until they are approved.

Catalog text and source snippets are data. Keep them apart from instructions in a prompt and
send only what the chunk needs. Tokens and cost estimates are labeled as estimates.

## Composition

`vendor/synapse` holds the unmodified archives, verified by `node vendor/synapse/verify.mjs`, and root `resolutions` point the
family at them. `libs/backend/ai` holds `LocalAssistants`, `AiProviderHost` and the strategies, and imports Synapse for types
only. `apps/desktop` and `apps/cli` load the modules and compose them, each with its own source of keys: the keychain through
`safeStorage` in main, or the environment and `--api-key` on the command line. The engine receives the result.

A local assistant runs with the login the user made with the tool: its home and configuration folders are the tool's own. A chunk
runs read-only in an empty folder, without tools where the driver can enforce that, so an assistant sees nothing of a repository
but the prompt.

## What a run leaves

During a run of Codex the profile really holds what the tool needs. Synapse copies the login into `assistants/codex/execution/<process>/codex/auth.json`
(mode 0600) and points `CODEX_HOME` there, and Codex writes its session there, with the text of the prompt, and its database next to
it. The other assistants keep their sessions in their own homes, so only their temporary folder lives in the profile. These folders
belong to one process, because the app and the command line share a profile and neither may pull the working copy from under the
other. A token that Codex refreshes reaches the login of the user when Synapse commits it, at the end of each call of the driver,
only if the original login is still what the copy was made from.

`LocalAssistants` removes both folders when the last call of an assistant has settled, which is after that commit, and again on
`dispose()` once Synapse has stopped its processes. A new call waits for a removal under way. After a failure with
`isCleanupIncomplete` a native process may still run and nothing was committed, so the folders stay. The next start removes them,
along with what a crashed process or an older version left, and spares the folders of a process that still runs.

## One path

`translateChunk` in `libs/backend/ai` is the only way to a translation: the generator of the CLI and `run()`, a hosted run, the
test lab and the value suggestion all go through it. It asks, checks with `validateChunk`, and asks again within the retry
budget. An answer that misses or changes a key fails the chunk once the budget is spent, and a bad chunk reaches nobody. A row
whose placeholders stay wrong is kept and flagged in a review, and it is left out of a run that writes straight away.

