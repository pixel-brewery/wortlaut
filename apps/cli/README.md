# 📦 @pixel-brewery/wortlaut-app

| Package Status | Source |
|----------------|--------|
| [![GitHub Packages](https://img.shields.io/github/v/release/RueDeRennes/mosaik?label=GitHub%20Packages&logo=github)](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-app) | [tools/wortlaut/app](../../tools/wortlaut/app) |

> CLI and programmatic entrypoint for the Wortlaut toolchain.
> Extract, analyze, transform, and generate translation resources for multiple frameworks and formats.

---

## 📁 Project Structure

Part of the monorepo [`mosaik`](https://github.com/RueDeRennes/mosaik)
Package path: `tools/wortlaut/app`
Version: see [GitHub Packages](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-app)
License: MIT

---

## 📦 Installation

```bash
yarn add @pixel-brewery/wortlaut-app
# or
npm install @pixel-brewery/wortlaut-app
```

With Yarn, use `nodeLinker: node-modules` in `.yarnrc.yml`. Yarn Plug'n'Play is
currently limited by Utilities 0.1.187 loading optional compiler/XML peers; see
[package installation](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).


---

## 🔧 Usage

### CLI

```sh
npx wortlaut <command> [options]
```

`npx wortlaut mcp` starts the MCP server over stdio for an assistant. It takes no arguments: what an assistant may do is set in the Wortlaut app, and without that the server is read only.

See `npx wortlaut <command> --help` for all options. By default a command applies its change set straight away. `--dry-run` only reports it, `--review` leaves it in the review list for `wortlaut changes apply <id>`, and `--json` prints one document for scripts and CI.

`analyze` and `detect` take `--cache` to reuse the results of files that did not change, in `.wortlaut/cache` or the folder of `--cache-dir`. It changes no result, a dry run only reads it, and the folder ignores itself in Git. `run()` takes the same as `cache: { enabled, dirPath }`.

### Programmatic API

```typescript
import { run, type IRunConfig } from '@pixel-brewery/wortlaut-app';

const config: IRunConfig = {
  cwd: process.cwd(),
  output: './locales',
  detect: {
    root: './src',
    preset: 'angular',
    type: 'json'
  },
  generate: {
    enabled: true,
    apiKey: process.env.GEMINI_API_KEY,
    locales: ['de', 'fr'],
    baseLocale: 'en'
  }
};

run(config).then(result => {
  console.log(result.generate);
});
```

---

## ⚙️ Features

- CLI for extraction, analysis, transformation, and AI-based generation of localization resources
- Reviewable change sets: `wortlaut changes list`, `show`, `apply` and `discard`
- Replacing hard-coded strings: `wortlaut detect --apply` rewrites the sources and adds new keys to the catalog of the base locale, as one change set
- Catalog edits as change sets: `wortlaut catalog set`, `comment`, `delete`, `merge` and `add-locale`
- Rule packs: `wortlaut rules add`, `list`, `check`, `update`, `enable`, `disable` and `severity`, pinned by commit and content hash in `wortlaut.lock.json`
- Effective settings with their sources: `wortlaut config list`, `get` and `set`, and `wortlaut init` for a new project
- Programmatic API for integration into CI/CD or custom tools
- Supports Angular, React, Vue, Lit, Stencil, and more

---

## 🛠 Recommendations

- Use as the main entrypoint for localization workflows in Nx monorepos.
- Integrate with CI/CD pipelines for automated i18n management.

---


## Translating with AI

```sh
# An assistant installed on this computer, with its own login. No key is involved.
npx wortlaut generate --strategy claude-code --base-locale en --locales de --resource-root i18n --namespace loc.orders --limit 10

# An API key provider. The key comes from the environment or --api-key, never from the keychain of the app.
OPENAI_API_KEY=... npx wortlaut generate --strategy openai --model gpt-4o-mini --base-locale en --locales de --resource-root i18n

# Where every provider stands. It starts no login and installs nothing.
npx wortlaut ai status
```

`--strategy` takes `openai` (or `chatgpt`), `google` (or `gemini`), `claude-code`, `codex` and `opencode`. `--scope` takes `all`, `new`
and `missing`, and `--namespace`, `--keys` and `--limit` narrow it down. `--instructions` goes to the prompt, apart from the catalog
text. Each answer of a model is checked for shape, row count, keys and placeholders, and a chunk is asked again within a budget. A
chunk that stays wrong fails the run, a failed or stopped run writes nothing, and what it finished waits for `wortlaut changes apply`.

## 🛠 Development

Run `yarn nx run wortlaut-app:build` from the workspace root. Compilation replaces `dist` with a complete fresh output before preparing the package, so directory casing changes and removed sources cannot leave stale modules behind. Make changes in `src` and rebuild instead of editing generated files.

---

## 📦 Publishing

```bash
yarn nx run wortlaut-app:publish
```

---

## 📄 License

MIT © Pixel Brewery

---
