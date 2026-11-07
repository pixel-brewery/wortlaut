# Local Mosaik developer MCP

Wortlaut uses its own [Wortlaut Designer](../../.agents/skills/wortlaut-designer/SKILL.md), which explicitly composes the shared [Pixel Brewery Designer](../../.agents/skills/designer/SKILL.md) and this project's [design contract](../../.agents/skills/wortlaut-designer/references/project.md). The MCP connection supplies development-time component documentation, recipes, templates, validation and export. It adds no product service and does not connect native assistant accounts.

## One connection and configuration owner

The only active Mosaik server is **`mosaik`**, a local stdio process using the preinstalled exact `@pixel-brewery/mosaik-mcp@0.1.192` development dependency:

```sh
yarn exec mosaik-mcp
```

Every project client uses `command: "yarn"` with `args: ["exec", "mosaik-mcp"]`, or its native command-array equivalent. No Mosaik HTTP connection, second server name, JavaScript entrypoint path or runtime package download is configured.

[`.vscode/mcp.json`](../../.vscode/mcp.json) is the canonical repository registry. The checked-in client definitions project the same connection into their native schemas:

| Client             | Project configuration   |
| ------------------ | ----------------------- |
| VS Code / Copilot  | `.vscode/mcp.json`      |
| Claude Code        | `.mcp.json`             |
| Codex              | `.codex/config.toml`    |
| GitHub Copilot CLI | `.github/mcp.json`      |
| Cursor             | `.cursor/mcp.json`      |
| Gemini CLI         | `.gemini/settings.json` |
| OpenCode           | `opencode.json`         |

When changing the registry, update the affected client definitions together and preserve unrelated servers/settings. Copilot CLI's `tools: ["*"]` belongs only in `.github/mcp.json`; do not copy it into Claude's configuration. Reconnect the server or restart the client in this trusted project after configuration changes. A file on disk does not inject tools into an already-running agent.

## Installation and runtime

Install the exact root development dependency through the existing Yarn lockfile with `yarn install --immutable`. The project's `@pixel-brewery` registry settings select `https://npm.pkg.github.com` and read `GITHUB_TOKEN` from the environment. Installation requires authorized package-read access. Keep credentials out of MCP configuration and preserve existing runtime component dependencies and vendor provenance.

Launch the client from this repository root so Yarn resolves the installed project binary. VS Code explicitly uses `${workspaceFolder}`; the other definitions use the repository working directory. The package reads its bundled data relative to its own installation. Do not replace the binary command with `npx`, `yarn dlx`, a JavaScript path, a peer checkout or an on-demand package install.

After installation, the server needs no API process, database, model credential, registry token or network connection. The bundled public catalog is the published **0.1.192 snapshot**. Its 32 public tools, resources and prompts cover documentation/catalog reads, design-tree validation, five framework exports and local Studio import artifacts. Authenticated cloud Studio reads/writes and uploads remain web-only operations outside this connection; `create_studio_project` returns a local import file rather than saving a cloud project.

## Design evidence and compatibility

Perform the shared Designer's complete mandatory catalog workflow through the local `mosaik` server. Record its package version and the IDs/options actually consulted. Read the authoring rules, search templates and recipes, inspect matching compositions and component/framework/token contracts, and validate authored `IElement` trees before export. Framework templates still require the shared source checker and actual application checks.

If a required call fails, retry once, report the exact failure and pause dependent design decisions. Do not silently add or fall back to an HTTP server, remembered APIs or raw local documentation. Neither an installed package nor a failed request establishes consultation.

Compare the snapshot's APIs with the actual installed runtime component versions before using them. Installing this documentation dependency does not upgrade those components or authorize a newer tag/property. Keep local architecture, state ownership, product boundaries and documented design exceptions.

Wortlaut keeps its Soho foundation, light/dark modes, English interface and theme-derived primary color, font and shape. `provideWortlautDesign`, `ThemeModeStore`, the shared UI stylesheet and authored `DESIGN.md` remain the actual sources.

## Verification scope

Configuration parsing, binary discovery and protocol initialization establish connection setup only. Required tool calls provide catalog evidence; source/composition checks and actual application interactions provide UI evidence. This setup does not establish a working new screen, recording, native permission flow or assistant execution.
