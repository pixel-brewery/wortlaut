// #region Imports

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectOptions } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandOptions } from './CommandOptions';
import { ConfigurationResolver, type IResolvedConfiguration } from './ConfigurationResolver';

// #endregion

describe('CommandOptions', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-options-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function resolve(
    file: ProjectOptions | null,
    args: ProjectOptions = {},
    env: NodeJS.ProcessEnv = {},
  ): IResolvedConfiguration {
    if (file) {
      writeFileSync(join(root, 'wortlaut.config.json'), JSON.stringify(file));
    }

    return new ConfigurationResolver(env).resolve({ cwd: root, arguments: args });
  }

  it('says what is missing when no catalogs are known', () => {
    // act & assert
    expect(() => CommandOptions.forSort(resolve(null))).toThrow(/--resource-root/);
  });

  it('does not need the key of a provider for sorting', () => {
    // arrange
    const configuration = resolve({
      actions: { detect: { resourceRoot: 'i18n' }, generate: { apiKey: '{env.NOT_SET}' } },
    });

    // act
    const options = CommandOptions.forSort(configuration);

    // assert
    expect(options.resourceRoot).toEqual([join(root, 'i18n')]);
  });

  it('fills the tokens of generate from the environment', () => {
    // arrange
    const configuration = resolve(
      {
        actions: {
          detect: { resourceRoot: 'i18n' },
          generate: { apiKey: '{env.MY_KEY}', model: '{env.MY_MODEL}' },
        },
      },
      {},
      { MY_KEY: 'sk-1', MY_MODEL: 'm' },
    );

    // act
    const options = CommandOptions.forGenerate(configuration);

    // assert
    expect(options.apiKey).toBe('sk-1');
    expect(options.model).toBe('m');
  });

  it('turns the verbose setting into the optional raw dump of generate', () => {
    // arrange
    const configuration = resolve({ verbose: true, actions: { detect: { resourceRoot: 'i18n' } } });

    // act & assert
    expect(CommandOptions.forGenerate(configuration).dumpModels).toBe(true);
  });

  describe('writeMode', () => {
    it('applies by default', () => {
      // act & assert
      expect(CommandOptions.writeMode(resolve(null))).toBe('apply');
    });

    it('leaves the change set for review when asked to', () => {
      // act & assert
      expect(CommandOptions.writeMode(resolve(null, { review: true }))).toBe('review');
      expect(CommandOptions.writeMode(resolve({ review: true }))).toBe('review');
    });

    it('lets a dry run win over a review from a file', () => {
      // act & assert
      expect(CommandOptions.writeMode(resolve({ review: true }, { dryRun: true }))).toBe('dry-run');
    });

    it('refuses both on one command line', () => {
      // act & assert
      expect(() => CommandOptions.writeMode(resolve(null, { dryRun: true, review: true }))).toThrow(
        /Choose one/,
      );
    });
  });

  describe('resolveWriteMode', () => {
    it('refuses both in one call', () => {
      // act & assert
      expect(() => CommandOptions.resolveWriteMode(true, true)).toThrow(/Choose one/);
    });

    it('maps the flags', () => {
      // act & assert
      expect(CommandOptions.resolveWriteMode(true, false)).toBe('dry-run');
      expect(CommandOptions.resolveWriteMode(false, true)).toBe('review');
      expect(CommandOptions.resolveWriteMode(undefined, undefined)).toBe('apply');
    });
  });
});
