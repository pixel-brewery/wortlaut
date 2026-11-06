// #region Imports

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_INIT_COMMAND_ARGS_CONFIG,
  type IInitCommandArgsConfig,
} from '../arguments/configurations/IInitCommandArgsConfig';
import { SortCommand } from './SortCommand';
import { DEFAULT_SORT_COMMAND_ARGS_CONFIG } from '../arguments/configurations/ISortCommandArgsConfig';
import { InitCommand } from './InitCommand';

// #endregion

describe('InitCommand', () => {
  let root: string;
  let file: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-init-')));
    file = join(root, 'wortlaut.config.json');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function createCommand(config: Partial<IInitCommandArgsConfig>): InitCommand {
    return new InitCommand(
      { ...DEFAULT_INIT_COMMAND_ARGS_CONFIG, cwd: root, ...config },
      createLogger(),
      new FileSystem(),
    );
  }

  it('writes the settings it is given in the shape of the executor options', async () => {
    // act
    await createCommand({
      root: 'src',
      resourceRoot: 'src/assets/i18n',
      preset: 'angular' as never,
      resourceKeyPrefix: 'loc',
      baseLocale: 'en',
      locales: ['de', 'fr'],
    }).execute();

    // assert
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      actions: {
        detect: {
          type: 'json',
          root: 'src',
          resourceRoot: ['assets/i18n'],
          preset: 'angular',
          resourceKey: { prefix: 'loc' },
        },
        analyze: { baseLocale: 'en' },
        generate: { baseLocale: 'en', locales: ['de', 'fr'] },
      },
    });
  });

  it('adds the folder of the cache to .gitignore in the same change set, and keeps what the file holds', async () => {
    // arrange
    writeFileSync(join(root, '.gitignore'), 'node_modules\ndist');

    // act
    await createCommand({ resourceRoot: 'i18n' }).execute();

    // assert
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(
      'node_modules\ndist\n.wortlaut/cache/\n',
    );
  });

  it('creates a .gitignore when there is none, and leaves one alone that covers the folder', async () => {
    // act
    await createCommand({ resourceRoot: 'i18n' }).execute();

    // assert
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('.wortlaut/cache/\n');

    // arrange
    writeFileSync(join(root, '.gitignore'), '.wortlaut/\n');

    // act
    await createCommand({ resourceRoot: 'i18n', force: true }).execute();

    // assert
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('.wortlaut/\n');
  });

  it('writes nothing with --dry-run, the .gitignore included', async () => {
    // act
    await createCommand({ resourceRoot: 'i18n', dryRun: true }).execute();

    // assert
    expect(existsSync(join(root, '.gitignore'))).toBe(false);
  });

  it('writes a file that the other commands then read', async () => {
    // arrange
    mkdirSync(join(root, 'i18n'));
    await createCommand({ resourceRoot: 'i18n' }).execute();
    const sort = new SortCommand(
      { ...DEFAULT_SORT_COMMAND_ARGS_CONFIG, cwd: root },
      createLogger(),
      new FileSystem(),
    );

    // act & assert: the directory is found, and only holds no catalog yet
    await expect(sort.execute()).rejects.toThrow(/empty|does not contain/);
  });

  it('writes nothing in a dry run and with review', async () => {
    // act
    await createCommand({ dryRun: true }).execute();
    await createCommand({ review: true }).execute();

    // assert
    expect(existsSync(file)).toBe(false);
  });

  it('keeps a file that exists unless forced', async () => {
    // arrange
    await createCommand({ preset: 'lit' as never }).execute();

    // act & assert
    await expect(createCommand({ preset: 'vue' as never }).execute()).rejects.toThrow(
      /already has/,
    );
    expect(JSON.parse(readFileSync(file, 'utf8')).actions.detect.preset).toBe('lit');

    await createCommand({ preset: 'vue' as never, force: true }).execute();
    expect(JSON.parse(readFileSync(file, 'utf8')).actions.detect.preset).toBe('vue');
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
