// #region Imports

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATALOG_COMMAND_ARGS_CONFIG } from '../arguments/configurations/ICatalogCommandArgsConfig';
import { CatalogCommand } from './CatalogCommand';

// #endregion

describe('CatalogCommand', () => {
  let root: string;
  let argv: Array<string>;
  const logger = {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;

  const run = async (...words: Array<string>): Promise<void> => {
    process.argv = ['node', 'wortlaut', 'catalog', ...words];

    const locale = words.includes('--locale') ? words[words.indexOf('--locale') + 1] : '';
    const positionals = words.filter(
      (word, index) => !word.startsWith('--') && words[index - 1] !== '--locale',
    );
    const command = new CatalogCommand(
      { ...DEFAULT_CATALOG_COMMAND_ARGS_CONFIG },
      logger,
      new FileSystem(),
    );

    await command.initialize();
    command.configure({
      ...DEFAULT_CATALOG_COMMAND_ARGS_CONFIG,
      cwd: root,
      resourceRoot: join(root, 'i18n'),
      locale,
      action: positionals[0],
      words: positionals.slice(1),
    });

    const result = await command.execute();

    expect(result.canceled).toBe(false);
  };

  beforeEach(() => {
    argv = process.argv;
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-catalog-')));
    process.env.WORTLAUT_HOME = join(root, 'profile');
    mkdirSync(join(root, 'i18n'));
    writeFileSync(join(root, 'i18n/lang.en.json'), '{\n  "a": "A"\n}\n');
    writeFileSync(join(root, 'i18n/lang.de.json'), '{\n  "a": "A"\n}\n');
  });

  afterEach(() => {
    process.argv = argv;
    delete process.env.WORTLAUT_HOME;
    rmSync(root, { recursive: true, force: true });
  });

  it('sets a value in the catalog of a locale', async () => {
    // act
    await run('set', 'a', 'Ä', '--locale', 'de');

    // assert
    expect(readFileSync(join(root, 'i18n/lang.de.json'), 'utf8')).toBe('{\n  "a": "Ä"\n}\n');
    expect(readFileSync(join(root, 'i18n/lang.en.json'), 'utf8')).toBe('{\n  "a": "A"\n}\n');
  });

  it('adds a locale and deletes a key', async () => {
    // act
    await run('add-locale', 'fr');
    await run('delete', 'a');

    // assert
    expect(JSON.parse(readFileSync(join(root, 'i18n/lang.fr.json'), 'utf8'))).toEqual({});
  });

  it('accepts --review, which leaves the change for review', () => {
    // act
    const command = new CatalogCommand(
      { ...DEFAULT_CATALOG_COMMAND_ARGS_CONFIG },
      logger,
      new FileSystem(),
    );

    // assert
    expect(command.args.flatMap((arg) => arg.alias)).toContain('--review');
  });
});
