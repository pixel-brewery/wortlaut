# 📦 @pixel-brewery/wortlaut-core

| Package Status                                                                                                                                                                                 | Source                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [![GitHub Packages](https://img.shields.io/github/v/release/RueDeRennes/mosaik?label=GitHub%20Packages&logo=github)](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-core) | [tools/wortlaut/core](../../tools/wortlaut/core) |

> Core logic, resource models, analyzers, transformers, and formatters for the Wortlaut toolchain.

---

## 📁 Project Structure

Part of the monorepo [`mosaik`](https://github.com/RueDeRennes/mosaik)
Package path: `tools/wortlaut/core`
Version: see [GitHub Packages](https://github.com/orgs/pixel-brewery/packages/npm/package/wortlaut-core)
License: MIT

---

## 📦 Installation

```bash
yarn add @pixel-brewery/wortlaut-core
# or
npm install @pixel-brewery/wortlaut-core
```

---

## 🔧 Usage

```typescript
import {
  ResourceReader,
  ResourceTransformer,
  ResourceAnalyzer,
} from '@pixel-brewery/wortlaut-core';

// Example: Read and analyze resources
const reader = new ResourceReader(console, fileSystem);
const resources = reader.scanDirectory('./locales', 'json');
const analyzer = new ResourceAnalyzer(console);
const result = analyzer.executeTask('missing-translation', {
  resource: resources[0],
  parameters: {},
});
```

---

## ⚙️ Features

- Resource models for JSON, RESX, TypeScript, and more
- Transformers and serializers for resource conversion
- Analyzers for missing translations, key consistency, and more
- Presets for Angular, React, Vue, Lit, Stencil

---

## 🛠 Recommendations

- Use as the foundation for all Wortlaut-based tools and workflows.
- Integrate with the CLI/app package for end-to-end localization automation.

---

## 📦 Publishing

```bash
yarn nx run wortlaut-core:publish
```

---

## 📄 License

MIT © Pixel Brewery

---
