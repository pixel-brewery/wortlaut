// #region Imports

import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { CommandFailureReportSchema, CommandReportSchema } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SORT_COMMAND_ARGS_CONFIG } from '../arguments/configurations/ISortCommandArgsConfig';
import { SortCommand } from './SortCommand';

// #endregion

describe('SortCommand', () => {
  let root: string;
  let file: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-sort-'));
    file = join(root, 'lang.en.json');
    writeFileSync(file, JSON.stringify({ loc: { b: 'B', c: 'C', a: 'A' } }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('names itself and declares its arguments', () => {
    // arrange
    const command = createCommand();

    // act
    const aliases = command.args?.flatMap((x) => x.alias);

    // assert
    expect(command.name).toBe('sort');
    expect(aliases).toEqual(
      expect.arrayContaining(['--order', '--type', '--resource-root', '--dry-run']),
    );
  });

  describe('in a repository with configuration', () => {
    let previousCwd: string;

    beforeEach(() => {
      previousCwd = process.cwd();
      writeFileSync(
        join(root, 'nx.json'),
        JSON.stringify({
          targetDefaults: {
            '@pixel-brewery/nx-tasks:localizator': {
              options: { actions: { sort: { order: 'desc' }, detect: { resourceRoot: ['i18n'] } } },
            },
          },
        }),
      );
      writeFileSync(
        join(root, 'project.json'),
        JSON.stringify({ targets: { intl: { executor: '@pixel-brewery/nx-tasks:localizator' } } }),
      );
      mkdirSync(join(root, 'i18n'));
      renameSync(file, join(root, 'i18n', 'lang.en.json'));
      file = join(root, 'i18n', 'lang.en.json');
    });

    afterEach(() => {
      process.chdir(previousCwd);
    });

    it('keeps producing the same files when a call names its own catalogs, whatever nx.json says', async () => {
      // arrange
      const command = createCommand();
      command.configure({
        ...DEFAULT_SORT_COMMAND_ARGS_CONFIG,
        cwd: root,
        resourceRoot: join(root, 'i18n'),
      });

      // act
      await command.execute();

      // assert
      expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('reads the Nx configuration when a call names no catalogs', async () => {
      // arrange
      const command = createCommand();
      command.configure({ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG, cwd: root });

      // act
      await command.execute();

      // assert
      expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
        'c',
        'b',
        'a',
      ]);
    });

    it('lets an argument win over the configuration', async () => {
      // arrange
      const command = createCommand();
      command.configure({
        ...DEFAULT_SORT_COMMAND_ARGS_CONFIG,
        cwd: root,
        order: 'desc',
        resourceRoot: join(root, 'i18n'),
      });
      writeFileSync(
        join(root, 'wortlaut.config.json'),
        JSON.stringify({ actions: { sort: { order: 'asc' } } }),
      );

      // act
      await command.execute();

      // assert
      expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
        'c',
        'b',
        'a',
      ]);
    });

    it('reads a configuration file even when a call names its own catalogs', async () => {
      // arrange
      const command = createCommand();
      command.configure({
        ...DEFAULT_SORT_COMMAND_ARGS_CONFIG,
        cwd: root,
        resourceRoot: join(root, 'i18n'),
      });
      writeFileSync(
        join(root, 'wortlaut.config.json'),
        JSON.stringify({ actions: { sort: { order: 'desc' } } }),
      );

      // act
      await command.execute();

      // assert
      expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
        'c',
        'b',
        'a',
      ]);
    });
  });

  it('applies the order parsed after its construction', async () => {
    // arrange
    const command = createCommand();
    command.configure({
      ...DEFAULT_SORT_COMMAND_ARGS_CONFIG,
      dryRun: false,
      order: 'desc',
      resourceRoot: root,
    });

    // act
    await command.execute();

    // assert
    expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('leaves the change set for review with the review option', async () => {
    // arrange
    const before = readFileSync(file, 'utf8');
    const command = createCommand();
    command.configure({ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG, review: true, resourceRoot: root });

    // act
    await command.execute();

    // assert
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('prints one JSON document on stdout and logs to stderr', async () => {
    // arrange
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger();
    const command = new SortCommand(
      { ...DEFAULT_SORT_COMMAND_ARGS_CONFIG },
      logger,
      new FileSystem(),
    );
    command.configure({ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG, json: true, resourceRoot: root });

    // act
    await command.execute();

    // assert
    const printed = stdout.mock.calls.map(([text]) => String(text));

    expect(printed).toHaveLength(1);
    expect(CommandReportSchema.parse(JSON.parse(printed[0]))).toMatchObject({
      ok: true,
      command: 'sort',
      changeSet: { state: 'applied' },
    });
    expect(logger.log).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();

    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('prints a failure as a JSON document and reports it to the program', async () => {
    // arrange
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const command = createCommand();
    command.configure({
      ...DEFAULT_SORT_COMMAND_ARGS_CONFIG,
      json: true,
      dryRun: true,
      review: true,
      resourceRoot: root,
    });

    // act
    const result = await command.execute();

    // assert
    const printed = String(stdout.mock.calls[0][0]);

    expect(result.canceled).toBe(true);
    expect(CommandFailureReportSchema.parse(JSON.parse(printed))).toMatchObject({
      ok: false,
      error: { code: 'invalid-arguments' },
    });

    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('leaves the files alone in a dry run parsed after its construction', async () => {
    // arrange
    const before = readFileSync(file, 'utf8');
    const command = createCommand();
    command.configure({ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG, dryRun: true, resourceRoot: root });

    // act
    await command.execute();

    // assert
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

function createLogger(): ILogger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

function createCommand(): SortCommand {
  return new SortCommand({ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG }, createLogger(), new FileSystem());
}
