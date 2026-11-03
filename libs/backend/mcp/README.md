# @pixel-brewery/wortlaut-mcp

The MCP server of Wortlaut: twelve tools over the engine that the app and the command line use, with the permission level each
one needs. It starts with `wortlaut mcp` over stdio, holds no state beyond its process and no logic of its own, and never starts
a provider or a model.

| Level | Tools |
| --- | --- |
| Read only | `list_projects`, `get_config`, `search_keys`, `detect`, `analyze`, `test_pattern`, `next_translations` |
| Propose changes | also `propose_translations`, `propose_keys`: they wait in the review list |
| Write | also `apply_changes`, `transform`, `sort`, with `dryRun` to only report |

The user sets the level in the app under MCP and plugins. It lives in `mcp.json` of the profile, is read for every call, and no
argument can raise it. Without a level or a known project the server is read only. No tool takes a path, and a project is named by
its id from `list_projects`.

`plugins/claude` and `plugins/codex` carry the server and a skill in the format of each tool, and no logic. They start the published
package.

## Package installation

With Yarn, use `nodeLinker: node-modules` in `.yarnrc.yml`. Yarn Plug'n'Play is
currently limited by Utilities 0.1.187 loading optional compiler/XML peers; see
[package installation](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).
