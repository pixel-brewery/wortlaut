// #region Imports

import { ResourceGenerator } from '@pixel-brewery/wortlaut-ai';
import { ResourceReader } from '@pixel-brewery/wortlaut-core';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATE_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IGenerateCommandArgsConfig';
import { GENERATE_COMMAND_ARGS, KEYS_ARG, LIMIT_ARG } from '../arguments/GenerateCommandArgs';
import { GenerateCommand } from './GenerateCommand';

// #endregion

describe('GenerateCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the only-new flag to the generator', async () => {
    // arrange
    const resource = { locale: 'en', name: 'lang.en.json', path: 'lang.en.json', type: 'json' };
    vi.spyOn(ResourceReader.prototype, 'scanDirectory').mockReturnValue([resource] as never);
    const run = vi
      .spyOn(ResourceGenerator.prototype, 'run')
      .mockResolvedValue({ status: 'completed', results: [], error: null });
    const command = new GenerateCommand(
      {
        ...DEFAULT_GENERATE_COMMAND_ARGS_CONFIG,
        resourceRoot: 'i18n',
        baseLocale: 'en',
        locales: ['de'],
        onlyNew: true,
        strategy: 'chatgpt',
        apiKey: 'test',
      },
      {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as unknown as ILogger,
      new FileSystem(),
    );

    // act
    await command.execute();

    // assert
    expect(run).toHaveBeenCalledWith(resource, ['de'], 'chatgpt', true);
  });

  it('declares its arguments, including the ones that were only reachable through run()', () => {
    // arrange
    const command = new GenerateCommand(
      { ...DEFAULT_GENERATE_COMMAND_ARGS_CONFIG },
      {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as unknown as ILogger,
      new FileSystem(),
    );

    // act
    const aliases = command.args.flatMap((x) => x.alias);

    // assert
    expect(aliases).toEqual(
      expect.arrayContaining([
        '--only-new',
        '--instructions',
        '--limit',
        '--scope',
        '--namespace',
        '--keys',
        '--review',
        '--json',
        '--dry-run',
      ]),
    );
  });

  it('accepts every name of the providers and the PO format', () => {
    // arrange
    const option = (name: string) =>
      GENERATE_COMMAND_ARGS.find((arg) => arg.alias.includes(name))?.options.choices;

    // act & assert
    expect(option('--strategy')).toEqual(
      expect.arrayContaining([
        'openai',
        'chatgpt',
        'google',
        'gemini',
        'claude-code',
        'codex',
        'opencode',
      ]),
    );
    expect(option('--type')).toContain('po');
  });

  it('refuses a limit that is no positive number', () => {
    // act & assert
    expect(() => (LIMIT_ARG.options.type as (value: string) => number)('many')).toThrow(
      /Invalid limit/,
    );
    expect((LIMIT_ARG.options.type as (value: string) => number)('40')).toBe(40);
  });

  it('reads a list of keys', () => {
    // act & assert
    expect((KEYS_ARG.options.type as (value: string) => Array<string>)('loc.a, loc.b,')).toEqual([
      'loc.a',
      'loc.b',
    ]);
  });

  it('keeps the defaults that existing targets depend on', () => {
    // assert
    expect(DEFAULT_GENERATE_COMMAND_ARGS_CONFIG).toMatchObject({
      strategy: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      chunkSize: 10,
      limit: null,
      instructions: '',
      onlyNew: false,
      scope: 'all',
      namespace: '',
      apiKey: '',
    });
  });
});
