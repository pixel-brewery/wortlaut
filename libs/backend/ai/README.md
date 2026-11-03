# 📦 @pixel-brewery/wortlaut-ai

| Package Status | Source |
|----------------|--------|
| [![GitHub Packages](https://img.shields.io/github/v/release/RueDeRennes/mosaik?label=GitHub%20Packages&logo=github)](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-ai) | [tools/wortlaut/ai](../../tools/wortlaut/ai) |

> AI-based translation strategies for the Wortlaut toolchain.
> Supports ChatGPT and Gemini for automated translation generation.

---

## 📁 Project Structure

Part of the monorepo [`mosaik`](https://github.com/RueDeRennes/mosaik)
Package path: `tools/wortlaut/ai`
Version: see [GitHub Packages](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-ai)
License: MIT

---

## 📦 Installation

```bash
yarn add @pixel-brewery/wortlaut-ai
# or
npm install @pixel-brewery/wortlaut-ai
```

With Yarn, use `nodeLinker: node-modules` in `.yarnrc.yml`. Yarn Plug'n'Play is
currently limited by Utilities 0.1.187 loading optional compiler/XML peers; see
[package installation](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).


---

## 🔧 Usage

```typescript
import { ResourceGenerator } from '@pixel-brewery/wortlaut-ai';

// Example: Generate translations using Gemini
const generator = new ResourceGenerator(logger, fileSystem, transformer, reader, {
  chunkSize: 10,
  limit: null,
  config: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    instructions: '' // Additional instructions for the AI
  }
});
const run = await generator.run(baseResource, ['de', 'fr'], 'chatgpt');
// run.status is completed, failed or stopped; run.results holds the proposals.
```

The generator writes no file. `run.results` holds what each target file would contain, and a provider failure or a stop keeps what was finished. `@pixel-brewery/wortlaut-engine` turns the proposals into a change set.

---

## ⚙️ Features

- AI translation via ChatGPT and Gemini integrations
- Chunked processing for large resource files
- Extensible strategy pattern

---

## 🛠 Recommendations

- Use with the Wortlaut CLI/app for automated translation workflows.
- Provide your API keys via environment variables or config.

---

## 🛠 Development

Run `yarn nx run wortlaut-ai:build` from the workspace root. Compilation replaces `dist` with a complete fresh output before preparing the package, so directory casing changes and removed sources cannot leave stale modules behind. The package preparation step verifies published entry points and relative imports with exact filename casing. Make changes in `src` and rebuild instead of editing generated files.

---

## 📦 Publishing

```bash
yarn nx run wortlaut-ai:publish
```

---

## 📄 License

MIT © Pixel Brewery

---
