// #region Imports

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DETECT_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IDetectCommandArgsConfig';
import { DETECT_COMMAND_ARGS } from '../arguments/DetectCommandArgs';
import { DetectCommand } from './DetectCommand';

// #endregion

describe('DetectCommand', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-detect-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('registers the options that could only be reached through run() so far', () => {
    // arrange
    const command = new DetectCommand(
      { ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG },
      createLogger(),
      new FileSystem(),
    );

    // act
    const aliases = command.args.flatMap((arg) => arg.alias);

    // assert
    expect(aliases).toEqual(
      expect.arrayContaining([
        '--preset',
        '--root',
        '--type',
        '--resource-key-prefix',
        '--resource-key-suffix',
        '--json',
      ]),
    );
  });

  it('replaces strings with keys through --apply and reads as keys afterwards', async () => {
    // arrange
    process.env.WORTLAUT_HOME = join(root, 'profile');
    mkdirSync(join(root, 'i18n'));
    writeFileSync(join(root, 'i18n/lang.en.json'), '{\n  "loc": {\n    "a": "A"\n  }\n}\n');
    writeFileSync(join(root, 'View.tsx'), 'export const View = () => <b>{t("Save changes")}</b>;');
    writeFileSync(join(root, 'View.spec.tsx'), 'export const x = t("In a test");');
    const command = new DetectCommand(
      { ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG },
      createLogger(),
      new FileSystem(),
    );

    command.configure({
      ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG,
      cwd: root,
      root,
      preset: 'react' as never,
      resourceKeyPrefix: 'loc',
      resourceRoot: join(root, 'i18n'),
      skipTests: true,
      apply: true,
    });

    // act
    await command.execute();
    delete process.env.WORTLAUT_HOME;

    // assert
    expect(readFileSync(join(root, 'View.tsx'), 'utf8')).toBe(
      'export const View = () => <b>{t("loc.save.changes")}</b>;',
    );
    expect(readFileSync(join(root, 'View.spec.tsx'), 'utf8')).toContain('In a test');
    expect(JSON.parse(readFileSync(join(root, 'i18n/lang.en.json'), 'utf8'))).toEqual({
      loc: { a: 'A', save: { changes: 'Save changes' } },
    });
  });

  it('leaves the change for review with --review and writes nothing', async () => {
    // arrange
    process.env.WORTLAUT_HOME = join(root, 'profile');
    mkdirSync(join(root, 'i18n'));
    writeFileSync(join(root, 'i18n/lang.en.json'), '{\n  "a": "A"\n}\n');
    writeFileSync(join(root, 'View.tsx'), 'export const a = t("Save changes");');
    const command = new DetectCommand(
      { ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG },
      createLogger(),
      new FileSystem(),
    );

    command.configure({
      ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG,
      cwd: root,
      root,
      preset: 'react' as never,
      resourceKeyPrefix: 'loc',
      resourceRoot: join(root, 'i18n'),
      apply: true,
      review: true,
    });

    // act
    await command.execute();
    delete process.env.WORTLAUT_HOME;

    // assert
    expect(command.args.flatMap((arg) => arg.alias)).toContain('--review');
    expect(readFileSync(join(root, 'View.tsx'), 'utf8')).toContain('Save changes');
    expect(readdirSync(join(root, 'profile', 'changes'))).toHaveLength(1);
  });

  it('keeps its output without the new flags, and leaves test files out with --skip-tests', async () => {
    // arrange
    writeFileSync(join(root, 'View.tsx'), 't("One");');
    writeFileSync(join(root, 'View.spec.tsx'), 't("Two");');
    const run = async (skipTests: boolean): Promise<number> => {
      const logger = createLogger();
      const command = new DetectCommand(
        { ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG },
        logger,
        new FileSystem(),
      );

      command.configure({
        ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG,
        cwd: root,
        root,
        preset: 'react' as never,
        resourceKeyPrefix: 'loc',
        skipTests,
      });
      await command.execute();

      return vi
        .mocked(logger.log)
        .mock.calls.filter(([line]) => String(line).includes(' hard-coded string')).length &&
        (vi.mocked(logger.log).mock.calls.at(-1)?.[0] as string).startsWith('2 ')
        ? 2
        : 1;
    };

    // act & assert
    expect(await run(false)).toBe(2);
    expect(await run(true)).toBe(1);
  });

  it('scans a .tsx file with the React preset', async () => {
    // arrange
    writeFileSync(join(root, 'View.tsx'), 'export const View = () => <b>{t("Save changes")}</b>;');
    const logger = createLogger();
    const command = new DetectCommand(
      { ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG },
      logger,
      new FileSystem(),
    );
    command.configure({
      ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG,
      cwd: root,
      root,
      preset: 'react' as never,
      resourceKeyPrefix: 'loc',
    });

    // act
    const result = await command.execute();

    // assert
    expect(result.canceled).toBe(false);
    expect(vi.mocked(logger.log).mock.calls.flat().join('\n')).toContain('Save changes');
  });

  it('accepts the PO format, which has a formatter now', () => {
    // act
    const types = DETECT_COMMAND_ARGS.find((arg) => arg.alias.includes('--type'))?.options.choices;

    // assert
    expect(types).toEqual(expect.arrayContaining(['json', 'resx', 'po']));
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
