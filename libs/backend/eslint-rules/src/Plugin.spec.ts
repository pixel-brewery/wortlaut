// #region Imports

import json from '@eslint/json';
import { ESLint, type Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as index from './Index.js';
import { configs, createResourcesConfig, plugin } from './Plugin.js';

// #endregion

/**
 * A project with a translation catalog in `src/i18n` and a `package.json`, which the resource rules must not treat as a
 * resource.
 */
const directory = mkdtempSync(join(tmpdir(), 'eslint-rules-plugin-'));

mkdirSync(join(directory, 'src', 'i18n'), { recursive: true });
writeFileSync(join(directory, 'package.json'), '{\n    "name": "",\n    "version": "1.0.0"\n}\n');
writeFileSync(
  join(directory, 'src', 'i18n', 'lang.en.json'),
  '{\n    "greeting": "Hello",\n    "farewell": "Goodbye"\n}\n',
);
writeFileSync(
  join(directory, 'src', 'i18n', 'lang.de.json'),
  '{\n    "greeting": "Hello",\n    "title": "",\n    "title": "Titel"\n}\n',
);

/**
 * The JSON language that the `configs.*` of `@pixel-brewery/eslint-config` configure for `**\/*.json`.
 */
const jsonConfig: Linter.Config = {
  files: ['**/*.json'],
  plugins: {
    json,
  },
  language: 'json/json',
};

async function lint(
  config: Array<Linter.Config>,
  file: string,
): Promise<Array<Pick<Linter.LintMessage, 'ruleId' | 'line' | 'column' | 'message'>>> {
  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const [result] = await eslint.lintFiles([join(directory, file)]);

  return result.messages.map(({ ruleId, line, column, message }) => ({
    ruleId,
    line,
    column,
    message,
  }));
}

describe('plugin', () => {
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('is exported with every rule, including unused-keys', () => {
    // assert
    expect(index.plugin).toBe(plugin);
    expect(index.unusedKeysRule).toBe(plugin.rules?.['unused-keys']);
    expect(Object.keys(plugin.rules ?? {}).sort()).toEqual([
      'duplicate-keys',
      'empty-values',
      'key-consistency',
      'missing-translations',
      'unused-keys',
    ]);
  });

  it('reports the resource problems of the configured translation files at each key', async () => {
    // arrange
    const config = [jsonConfig, ...configs.resources({ files: ['src/i18n/*.json'] })];

    // act
    const messages = await lint(config, 'src/i18n/lang.de.json');

    // assert
    expect(messages.map(({ ruleId, line, column }) => [ruleId, line, column])).toEqual([
      ['wortlaut/key-consistency', 1, 1],
      ['wortlaut/missing-translations', 2, 5],
      ['wortlaut/duplicate-keys', 4, 5],
    ]);
    expect(messages[0].message).toContain('"farewell"');
  });

  it('leaves the JSON files outside of the configured translation files alone', async () => {
    // arrange
    const config = [jsonConfig, ...createResourcesConfig({ files: ['src/i18n/*.json'] })];

    // act
    const messages = await lint(config, 'package.json');

    // assert
    expect(messages).toEqual([]);
  });

  it('enables unused-keys only with used keys and disables missing-translations on request', () => {
    // act
    const [defaults] = createResourcesConfig({ files: ['**/*.json'] });
    const [custom] = createResourcesConfig({
      files: ['**/*.json'],
      missingTranslations: false,
      unusedKeys: {
        usedKeys: ['greeting'],
      },
      severity: 'error',
    });

    // assert
    expect(Object.keys(defaults.rules ?? {})).not.toContain('wortlaut/unused-keys');
    expect(defaults.rules?.['wortlaut/missing-translations']).toEqual(['warn', {}]);
    expect(custom.rules?.['wortlaut/unused-keys']).toEqual(['error', { usedKeys: ['greeting'] }]);
    expect(Object.keys(custom.rules ?? {})).not.toContain('wortlaut/missing-translations');
  });
});
