# @pixel-brewery/wortlaut-eslint-rules

Checks translation catalogs while linting, with the analyzer rules of `@pixel-brewery/wortlaut-core`. A finding appears in the editor and in the lint run, on the key it concerns.

```js
import { configs } from '@pixel-brewery/eslint-config';
import { createResourcesConfig } from '@pixel-brewery/wortlaut-eslint-rules';

export default [
    ...configs.base,
    ...createResourcesConfig({ files: ['src/i18n/*.json'] })
];
```

`files` is required, because the rules treat every matched file as a catalog whose name carries its locale, such as `lang.de.json`. The JSON files need a language of their own, such as `json/json` of `@eslint/json`. The configuration only adds the rules.

## Rules

| Rule | Reports |
| --- | --- |
| `wortlaut/duplicate-keys` | A key that appears twice in a catalog |
| `wortlaut/empty-values` | A key without a value |
| `wortlaut/key-consistency` | A key that does not follow the structure of the others |
| `wortlaut/missing-translations` | A key that a locale has not translated. Takes `baseLocale`, `identicalKeys` and `identicalValues`. Set `missingTranslations` to `false` to turn it off |
| `wortlaut/unused-keys` | A key the code does not use. Only runs with `unusedKeys.usedKeys`, because without them every key would count as unused |

`severity` sets all of them and defaults to `warn`. `multipleKeyUsageRule` is exported for a repository that registers it itself.

## Package installation

The package lies on GitHub Packages, which needs a token even for public packages. See [Releasing](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).
