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
import { join, normalize } from 'node:path';
import { ResourceType } from '@pixel-brewery/wortlaut-core';
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from './Run';

// #endregion

describe('run', () => {
  let root: string;
  let file: string;
  const unsorted = JSON.stringify({ loc: { b: 'B', a: 'A' } });

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-run-')));
    mkdirSync(join(root, 'src', 'assets', 'i18n'), { recursive: true });
    file = join(root, 'src', 'assets', 'i18n', 'lang.en.json');
    writeFileSync(file, unsorted);

    for (const method of ['log', 'info', 'warn', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation(() => undefined);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const detect = { root: 'src', resourceRoot: ['assets/i18n'] };

  describe('rule packs', () => {
    const pack = `${JSON.stringify({ schemaVersion: 1, id: 'our-pack', name: 'Our pack', description: 'Ours.', version: '1.0.0', rules: [{ id: 'no-a', description: 'No A.', severity: 'error', message: 'Found.', pattern: { regex: '^A$' } }] }, null, 2)}\n`;

    const pin = async (): Promise<void> => {
      const engine = new WortlautEngine({
        surface: 'cli',
        logger: console as never,
        profileRoot: join(root, 'profile'),
        home: root,
        env: {},
      });
      const { pack: checked } = await engine.rulePacks.inspect('./rules/our-pack', root);

      await engine.rulePacks.install(
        checked as NonNullable<typeof checked>,
        engine.rulePacks.scopeAt(
          root,
          engine.resolveConfiguration({ cwd: root, arguments: {}, readNx: false }),
        ),
        'apply',
      );
    };

    beforeEach(() => {
      mkdirSync(join(root, '.git'));
      mkdirSync(join(root, 'rules', 'our-pack'), { recursive: true });
      writeFileSync(join(root, 'rules', 'our-pack', 'wortlaut-pack.json'), pack);
    });

    it('stays what it was without a lock file and severities: no new reason to fail', async () => {
      // act
      const result = await run({ cwd: root, actions: { detect, analyze: {} } });

      // assert
      expect(result).not.toHaveProperty('gate');
      expect(result.analyze?.map((rule) => rule.message)).not.toContain('Found.');
    });

    it('runs the rules of the lock file on the path of the app, and hands an executor what they are worth', async () => {
      // arrange
      await pin();

      // act
      const result = await run({ cwd: root, actions: { detect, analyze: {} } });

      // assert
      expect(result.analyze?.find((rule) => rule.message === 'Found.')?.findings).toEqual([
        {
          rule: 'no-a',
          key: 'loc.a',
          locale: expect.any(String),
          message: 'Found.',
          severity: 'error',
        },
      ]);
      expect(result.gate).toMatchObject({ errors: 1, refusedPacks: [] });
    });

    it('does not run a changed pack, and says so', async () => {
      // arrange
      await pin();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      writeFileSync(join(root, 'rules', 'our-pack', 'wortlaut-pack.json'), `${pack} `);

      // act
      const result = await run({ cwd: root, actions: { detect, analyze: {} } });

      // assert
      expect(result.analyze?.map((rule) => rule.message)).not.toContain('Found.');
      expect(result.gate?.refusedPacks).toEqual([
        { pack: 'Our pack', reason: expect.stringContaining('does not match its pin') },
      ]);
    });

    it('takes severities from its options', async () => {
      // arrange
      await pin();

      // act
      const off = await run({
        cwd: root,
        actions: { detect, analyze: { severities: { 'no-a': 'off' } } },
      });
      const lower = await run({
        cwd: root,
        actions: { detect, analyze: { severities: { 'no-a': 'warning' } } },
      });

      // assert
      expect(off.analyze?.map((rule) => rule.message)).not.toContain('Found.');
      expect(lower.gate).toMatchObject({ errors: 0, warnings: 1 });
    });
  });

  it('resolves resourceRoot below root and applies straight away, as the Nx executor expects', async () => {
    // act
    const result = await run({ cwd: root, actions: { detect, sort: { order: 'desc' } } });

    // assert
    expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
      'b',
      'a',
    ]);
    expect(result.sort?.map((resource) => normalize(resource.path))).toEqual([file]);
  });

  describe('its cache', () => {
    const analyze = (
      cache: { enabled?: boolean; dirPath?: string } | undefined,
      dryRun = false,
    ): ReturnType<typeof run> =>
      run({
        cwd: root,
        dryRun,
        ...(cache ? { cache } : {}),
        actions: { detect: { resourceRoot: 'i18n' }, analyze: { baseLocale: 'en' } },
      });

    beforeEach(() => {
      mkdirSync(join(root, 'i18n'), { recursive: true });
      writeFileSync(
        join(root, 'i18n', 'lang.en.json'),
        JSON.stringify({ title: 'Title', same: 'Same' }),
      );
      writeFileSync(
        join(root, 'i18n', 'lang.de.json'),
        JSON.stringify({ title: 'Titel', same: 'Same' }),
      );
    });

    it('writes none by default, and none with enabled off', async () => {
      // act
      await analyze(undefined);
      await analyze({ enabled: false, dirPath: '.cache-here' });

      // assert
      expect(existsSync(join(root, '.wortlaut'))).toBe(false);
      expect(existsSync(join(root, '.cache-here'))).toBe(false);
    });

    it('honours enabled and dirPath, and finds a change at once', async () => {
      // arrange
      const uncached = (await analyze(undefined)).analyze?.map((result) => [
        result.success,
        result.message,
      ]);

      // act
      const first = (await analyze({ enabled: true, dirPath: '.cache-here' })).analyze?.map(
        (result) => [result.success, result.message],
      );
      const second = (await analyze({ enabled: true, dirPath: '.cache-here' })).analyze?.map(
        (result) => [result.success, result.message],
      );

      writeFileSync(
        join(root, 'i18n', 'lang.de.json'),
        JSON.stringify({ title: 'Titel', same: 'Gleich' }),
      );

      const changed = (await analyze({ enabled: true, dirPath: '.cache-here' })).analyze?.map(
        (result) => [result.success, result.message],
      );
      const fresh = (await analyze(undefined)).analyze?.map((result) => [
        result.success,
        result.message,
      ]);

      // assert
      expect(existsSync(join(root, '.cache-here', '.gitignore'))).toBe(true);
      expect(first).toEqual(uncached);
      expect(second).toEqual(uncached);
      expect(changed).toEqual(fresh);
      expect(changed).not.toEqual(uncached);
    });

    it('only reads it in a dry run', async () => {
      // act
      await analyze({ enabled: true }, true);

      // assert
      expect(existsSync(join(root, '.wortlaut'))).toBe(false);
    });
  });

  it('writes nothing in a dry run', async () => {
    // act
    await run({ cwd: root, dryRun: true, actions: { detect, sort: { order: 'asc' } } });

    // assert
    expect(readFileSync(file, 'utf8')).toBe(unsorted);
  });

  it('leaves the change set for review with the new option', async () => {
    // act
    const result = await run({
      cwd: root,
      review: true,
      actions: { detect, sort: { order: 'asc' } },
    });

    // assert
    expect(readFileSync(file, 'utf8')).toBe(unsorted);

    await new WortlautEngine({ surface: 'api', logger: console }).applyChangeSet(
      result.changeSetId as string,
      root,
    );

    expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
      'a',
      'b',
    ]);
  });

  it('reads no configuration file, because Nx has already merged the options', async () => {
    // arrange
    writeFileSync(
      join(root, 'wortlaut.config.json'),
      JSON.stringify({ actions: { sort: { order: 'desc' } } }),
    );

    // act
    await run({ cwd: root, actions: { detect, sort: { order: 'asc' } } });

    // assert
    expect(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { loc: object }).loc)).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps the choice of the command by the actions, analyze first', async () => {
    // act
    const result = await run({
      cwd: root,
      actions: { detect, analyze: { rules: ['empty-values'] }, sort: { order: 'asc' } },
    });

    // assert
    expect(result.analyze).toHaveLength(1);
    expect(result.sort).toBeUndefined();
    expect(readFileSync(file, 'utf8')).toBe(unsorted);
  });

  it('transforms into the given types and writes the source of nothing else', async () => {
    // act
    const result = await run({
      cwd: root,
      actions: { detect, transform: { types: [ResourceType.Resx] } },
    });

    // assert
    expect(result.transform).toHaveLength(1);
    expect(existsSync(join(root, 'src', 'assets', 'i18n', 'lang.en.resx'))).toBe(true);
  });

  it('detects with the Lit preset by default', async () => {
    // arrange
    writeFileSync(join(root, 'src', 'view.ts'), `translate('Hello');`);

    // act
    const result = await run({ cwd: root, actions: { detect: { root: 'src' } } });

    // assert
    expect(result.localizations?.map((localization) => normalize(localization.filePath))).toEqual([
      join(root, 'src', 'view.ts'),
    ]);
  });

  it('refuses a dry run with a review', async () => {
    // act & assert
    await expect(
      run({ cwd: root, dryRun: true, review: true, actions: { detect, sort: {} } }),
    ).rejects.toThrow(/Choose one/);
  });

  it('records the run under the Nx surface inside an Nx task', async () => {
    // arrange
    vi.stubEnv('NX_TASK_TARGET_PROJECT', 'ui');

    // act
    const result = await run({ cwd: root, actions: { detect, sort: {} } });

    // assert
    const stored = new WortlautEngine({ surface: 'api', logger: console }).runs.get(
      result.runId as string,
    );

    expect(stored?.surface).toBe('nx');
    vi.unstubAllEnvs();
  });
});
