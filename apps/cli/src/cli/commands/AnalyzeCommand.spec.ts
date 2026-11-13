// #region Imports

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES_ARG } from '../arguments/AnalyzeCommandArgs';
import { DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IAnalyzeCommandArgsConfig';
import { AnalyzeCommand } from './AnalyzeCommand';

// #endregion

describe('AnalyzeCommand', () => {
  let root: string;
  let resources: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-analyze-'));
    resources = join(root, 'i18n');
    mkdirSync(resources);
    writeFileSync(join(resources, 'lang.en.json'), JSON.stringify({ loc: { a: 'A' } }));
    writeFileSync(join(resources, 'lang.de.json'), JSON.stringify({ loc: { a: 'Ä' } }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs all rules when none is configured, except unused-keys without sources', async () => {
    // arrange
    const command = createCommand({ resourceRoot: resources });

    // act
    const result = await command.execute();

    // assert
    expect(ruleCount(result.result)).toBe(6 * 2);
  });

  it('runs unused-keys as well when sources are available', async () => {
    // arrange
    writeFileSync(join(root, 'view.ts'), `translate('loc.a');`);
    const command = createCommand({
      resourceRoot: resources,
      root,
      preset: 'lit' as never,
      resourceKeyPrefix: 'loc',
    });

    // act
    const result = await command.execute();

    // assert
    expect(ruleCount(result.result)).toBe(7 * 2);
  });

  it('accepts a root without a preset', async () => {
    // arrange
    const command = createCommand({ resourceRoot: resources, root, rules: ['empty-values'] });

    // act
    const result = await command.execute();

    // assert
    expect(ruleCount(result.result)).toBe(2);
  });

  it('uses expected locales from the project configuration', async () => {
    writeFileSync(join(resources, 'lang.de.json'), '{}');
    writeFileSync(
      join(root, 'wortlaut.config.json'),
      JSON.stringify({ actions: { analyze: { expectedLocales: ['en', 'de'] } } }),
    );
    const command = createCommand({ cwd: root, resourceRoot: resources });

    await expect(command.execute()).rejects.toThrow(/expected locale\(s\) de/);
  });

  it('reads its rules as a comma-separated list', () => {
    // act
    const rules = (RULES_ARG.options.type as (value: string) => Array<string>)(
      'empty-values, unused-keys',
    );

    // assert
    expect(rules).toEqual(['empty-values', 'unused-keys']);
  });
});

function createCommand(
  config: Partial<typeof DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG>,
): AnalyzeCommand {
  return new AnalyzeCommand(
    { ...DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG, ...config },
    {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger,
    new FileSystem(),
  );
}

function ruleCount(results: Array<unknown> | undefined): number {
  return results?.length ?? 0;
}
