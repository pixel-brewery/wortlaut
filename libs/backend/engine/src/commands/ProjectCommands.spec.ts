// #region Imports

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import type { RunResult } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';
import { toConfigurationFile, type IBatchChange } from './ProjectCommands';

// #endregion

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;

describe('ProjectCommands', () => {
  let root: string;
  let repository: string;
  let engine: WortlautEngine;
  let projectId: string;
  let workspaceId: string;

  const write = (path: string, content: unknown): void => {
    const file = join(repository, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    );
  };
  const read = (path: string): string => readFileSync(join(repository, path), 'utf8');
  const CONFIG = {
    actions: {
      detect: {
        root: 'src',
        resourceRoot: ['i18n'],
        preset: 'angular',
        type: 'json',
        resourceKey: { prefix: 'loc' },
      },
      analyze: { baseLocale: 'en' },
    },
  };

  const scan = async (skipTests = true) => {
    const result = await engine.commands.run(
      { command: 'detect', projectId, input: { preset: 'angular', suffix: '', skipTests } },
      { dryRun: true, runId: 'scan-1' },
    );

    expect(result.failure).toBeNull();

    if (result.output?.command !== 'detect') {
      throw new Error('A scan has a scan as its output.');
    }

    return result.output.scan;
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-commands-')));
    repository = join(root, 'shop');
    write('wortlaut.config.json', CONFIG);
    write('src/i18n/lang.en.json', { loc: { saved: 'Saved', b: 'Bee', a: 'Ay' } });
    write('src/i18n/lang.de.json', { loc: { saved: 'Gespeichert', b: 'Bee', a: 'Ah' } });
    write(
      'src/panel.html',
      "<h2>{{ 'Ready to go' | translate }}</h2>\n<p>{{ 'Saved' | translate }}</p>\n<p>{{ 'loc.a' | translate }}</p>\n",
    );
    write('src/panel.spec.ts', "translate('In a test');\n");
    engine = new WortlautEngine({
      surface: 'desktop',
      logger: LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
    });
    ({ workspaceId, projectId } = engine.workspaces.register({
      inspection: engine.inspector.inspect(repository),
      workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
      preset: 'angular',
      baseLocale: 'en',
      targetLocales: ['de'],
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('detect', () => {
    it('finds hard-coded strings with their keys and hints, and leaves test files out', async () => {
      // act
      const result = await scan();

      // assert
      expect(result).toMatchObject({
        filesScanned: 1,
        stringsFound: 3,
        alreadyKeys: 1,
        hardCoded: 2,
      });
      expect(result.rows[0]).toMatchObject({
        value: 'Ready to go',
        location: 'panel.html:1',
        file: 'src/panel.html',
        key: 'loc.ready.to.go',
        hint: { kind: 'new' },
        canApply: true,
        before: "<h2>{{ 'Ready to go' | translate }}</h2>",
        after: "<h2>{{ 'loc.ready.to.go' | translate }}</h2>",
      });
      expect(result.rows[1]).toMatchObject({
        value: 'Saved',
        key: 'loc.saved',
        hint: { kind: 'reuse', key: 'loc.saved' },
      });
    });

    it('marks a test file when it is scanned, and it cannot be applied', async () => {
      // act
      const result = await scan(false);
      const row = result.rows.find((candidate) => candidate.file === 'src/panel.spec.ts');

      // assert
      expect(row).toMatchObject({
        hint: { kind: 'test' },
        canApply: false,
        after: 'Ignored, because it is a test file',
      });
    });

    it('never reports a generated key as hard-coded again', async () => {
      // arrange
      const result = await scan();

      // act
      await engine.commands.applyDetect(
        {
          projectId,
          scanId: result.scanId,
          rows: result.rows.map((row) => ({ rowId: row.id, key: row.key })),
        },
        false,
      );

      // assert
      expect((await scan()).rows).toEqual([]);
    });

    it('rewrites the source and adds new keys to the catalog in one change set, and reuses existing keys', async () => {
      // arrange
      const result = await scan();

      // act
      const outcome = await engine.commands.applyDetect(
        {
          projectId,
          scanId: result.scanId,
          rows: result.rows.map((row) => ({ rowId: row.id, key: row.key })),
        },
        false,
      );

      // assert
      expect(outcome).toMatchObject({
        state: 'applied',
        files: ['src/panel.html', 'src/i18n/lang.en.json'],
      });
      expect(read('src/panel.html')).toBe(
        "<h2>{{ 'loc.ready.to.go' | translate }}</h2>\n<p>{{ 'loc.saved' | translate }}</p>\n<p>{{ 'loc.a' | translate }}</p>\n",
      );
      expect(JSON.parse(read('src/i18n/lang.en.json'))).toEqual({
        loc: { saved: 'Saved', b: 'Bee', a: 'Ay', ready: { to: { go: 'Ready to go' } } },
      });
    });

    it('leaves the change in Review and writes nothing while dry run is on', async () => {
      // arrange
      const result = await scan();
      const before = read('src/panel.html');

      // act
      const outcome = await engine.commands.applyDetect(
        {
          projectId,
          scanId: result.scanId,
          rows: [{ rowId: result.rows[0].id, key: 'loc.named.by.me' }],
        },
        true,
      );

      // assert
      expect(outcome.state).toBe('pending');
      expect(read('src/panel.html')).toBe(before);
      expect(engine.review.list(workspaceId).map((item) => item.id)).toEqual([outcome.changeSetId]);
    });

    it('fails with the name of a file that changed since the scan, and writes nothing', async () => {
      // arrange
      const result = await scan();
      const catalog = read('src/i18n/lang.en.json');

      write('src/panel.html', '<p>Somebody else was here</p>\n');

      // act & assert
      await expect(
        engine.commands.applyDetect(
          { projectId, scanId: result.scanId, rows: [{ rowId: result.rows[0].id, key: 'loc.x' }] },
          false,
        ),
      ).rejects.toThrow('src/panel.html changed since the scan');
      expect(read('src/i18n/lang.en.json')).toBe(catalog);
    });

    it('refuses a key that already holds another text', async () => {
      // arrange
      const result = await scan();

      // act & assert
      await expect(
        engine.commands.applyDetect(
          {
            projectId,
            scanId: result.scanId,
            rows: [{ rowId: result.rows[0].id, key: 'loc.saved' }],
          },
          false,
        ),
      ).rejects.toThrow('already holds another text');
    });

    it('keeps a bound on the rows of a scan, and still says how many strings there are', async () => {
      // arrange
      write('src/big.html', `{{ 'Same text' | translate }}\n`.repeat(5100));

      // act
      const result = await scan();

      // assert
      expect(result.hardCoded).toBe(5102);
      expect(result.rows).toHaveLength(5000);
    });

    it('stops a scan that is cancelled, without a result', async () => {
      // arrange
      const controller = new AbortController();

      controller.abort();

      // act
      const result = await engine.commands.run(
        { command: 'detect', projectId, input: { preset: 'angular', suffix: '', skipTests: true } },
        { dryRun: true, runId: 'stopped-1', signal: controller.signal },
      );

      // assert
      expect(result).toMatchObject({ state: 'stopped', output: null });
      expect(engine.runs.get('stopped-1')?.state).toBe('stopped');
    });

    it('tells a listener how far a scan is', async () => {
      // arrange
      const progress = new Array<string>();

      // act
      await engine.commands.run(
        { command: 'detect', projectId, input: { preset: 'angular', suffix: '', skipTests: true } },
        {
          dryRun: true,
          runId: 'live-1',
          listener: {
            progress: (event) => progress.push(`${event.phase} ${event.completed}/${event.total}`),
          },
        },
      );

      // assert
      expect(progress).toEqual(['Scanning the sources 0/1']);
    });
  });

  describe('analyze', () => {
    it('runs the chosen rules and projects rows with what their action needs', async () => {
      // act
      const result = await engine.commands.run(
        {
          command: 'analyze',
          projectId,
          input: { rules: ['missing-translations', 'unused-keys', 'empty-values'] },
        },
        { dryRun: true, runId: 'analysis-1' },
      );

      // assert
      expect(result.output).toMatchObject({ command: 'analyze' });

      const rules = result.output?.command === 'analyze' ? result.output.rules : [];

      expect(rules.map((rule) => rule.id)).toEqual([
        'missing-translations',
        'unused-keys',
        'empty-values',
      ]);
      expect(rules[0]).toMatchObject({
        passed: false,
        locales: [{ locale: 'de', count: 1 }],
        rows: [{ a: 'loc.b', b: 'Bee', value: 'Bee', key: 'loc.b' }],
      });
      expect(rules[1].rows.map((row) => row.key)).toContain('loc.b');
      expect(rules[2]).toMatchObject({ passed: true });
      expect(rules[2].rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ a: 'en', b: 'Pass', locale: 'en' }),
          expect.objectContaining({ a: 'de', b: 'Pass', locale: 'de' }),
        ]),
      );
    });

    it('offers every rule, and starts unused-keys off without a source root', () => {
      // arrange
      write('wortlaut.config.json', {
        actions: { detect: { resourceRoot: ['src/i18n'] }, analyze: { baseLocale: 'en' } },
      });

      // act
      const overview = engine.commands.analyzeOverview(projectId);

      // assert
      expect(overview.rules.find((rule) => rule.id === 'unused-keys')?.enabled).toBe(false);
      expect(overview.rules.find((rule) => rule.id === 'empty-values')).toMatchObject({
        enabled: true,
        group: 'Built-in rules',
        description: 'A key exists but has no text.',
      });
    });

    it('allows a value through the configuration, so the next analysis passes', async () => {
      // act
      const outcome = await engine.commands.addException(
        projectId,
        'identicalValues',
        'Bee',
        false,
      );
      const result = await engine.commands.run(
        { command: 'analyze', projectId, input: { rules: ['missing-translations'] } },
        { dryRun: false, runId: 'analysis-2' },
      );

      // assert
      expect(outcome).toMatchObject({ state: 'applied', files: ['wortlaut.config.json'] });
      expect(JSON.parse(read('wortlaut.config.json')).actions.analyze.identicalValues).toEqual([
        'Bee',
      ]);
      expect(result.output?.command === 'analyze' && result.output.rules[0].passed).toBe(true);
    });

    it('leaves a declared key in Review while dry run is on', async () => {
      // arrange
      const before = read('wortlaut.config.json');

      // act
      const outcome = await engine.commands.addException(projectId, 'usedKeys', 'loc.b', true);

      // assert
      expect(outcome.state).toBe('pending');
      expect(read('wortlaut.config.json')).toBe(before);
    });
  });

  describe('transform and sort', () => {
    it('sorts through Review with dry run on, says what would be written, and leaves one thing to review when repeated', async () => {
      // arrange
      const before = read('src/i18n/lang.en.json');
      const sort = () =>
        engine.commands.run(
          { command: 'sort', projectId, input: { order: 'asc' } },
          { dryRun: true, runId: `sort-${Math.random().toString(36).slice(2)}` },
        );

      // act
      await sort();

      const result = await sort();

      // assert
      expect(result.outcome?.state).toBe('pending');
      expect(
        result.output?.command === 'sort' &&
          result.output.rows.find((row) => row.file === 'src/i18n/lang.en.json'),
      ).toMatchObject({ state: 'would-be-written', keys: 3 });
      expect(read('src/i18n/lang.en.json')).toBe(before);
      expect(engine.review.list(workspaceId)).toHaveLength(1);
    });

    it('writes a transformation with dry run off and reports a file that does not change', async () => {
      // arrange
      const run = () =>
        engine.commands.run(
          { command: 'transform', projectId, input: { types: ['resx'] } },
          { dryRun: false, runId: `t-${Math.random().toString(36).slice(2)}` },
        );

      // act
      const first = await run();
      const second = await run();

      // assert
      const written =
        first.output?.command === 'transform'
          ? first.output.rows.find((row) => row.file === 'src/i18n/lang.en.resx')
          : null;

      expect(written).toMatchObject({ state: 'written' });
      expect(written?.preview).toContain('name="loc.saved"');
      expect(
        second.output?.command === 'transform' && second.output.rows.map((row) => row.state),
      ).toEqual(['unchanged', 'unchanged']);
      expect(existsSync(join(repository, 'src/i18n/lang.de.resx'))).toBe(true);
    });

    it('takes its targets from the engine, without the source format', () => {
      // act
      const overview = engine.commands.transformOverview(projectId);

      // assert
      expect(overview.source).toBe('lang.*.json');
      expect(overview.formats.map((format) => format.id)).toEqual(['ts', 'resx', 'po']);
      expect(overview).toMatchObject({ keyCount: 3, fileCount: 2, order: 'asc' });
    });

    it('names the key in a serializer failure and writes nothing', async () => {
      // arrange
      write(
        'src/i18n/lang.en.resx',
        '<?xml version="1.0"?><root><data name="a"><value>A</value></data><data name="a.b"><value>B</value></data></root>',
      );
      write('wortlaut.config.json', {
        actions: {
          detect: { root: 'src', resourceRoot: ['i18n'], preset: 'angular', type: 'resx' },
          analyze: { baseLocale: 'en' },
        },
      });

      // act
      const result = await engine.commands.run(
        { command: 'transform', projectId, input: { types: ['json'] } },
        { dryRun: false, runId: 'bad-1' },
      );

      // assert
      expect(result.state).toBe('failed');
      expect(result.failure).toContain('"a"');
      expect(existsSync(join(repository, 'src/i18n/lang.en.json.tmp'))).toBe(false);
    });
  });

  describe('catalog edits', () => {
    it('changes a value in the catalog of the locale, as a change set', async () => {
      // act
      const outcome = await engine.commands.editCatalog(
        projectId,
        { kind: 'set-value', key: 'loc.b', locale: 'de', value: 'Biene' },
        false,
      );

      // assert
      expect(outcome.files).toEqual(['src/i18n/lang.de.json']);
      expect(JSON.parse(read('src/i18n/lang.de.json')).loc.b).toBe('Biene');
      expect(engine.catalogs.keyDetail(projectId, 'loc.b', 'de').target).toBe('Biene');
    });

    it('deletes a key from every locale', async () => {
      // act
      await engine.commands.editCatalog(projectId, { kind: 'delete-key', key: 'loc.b' }, false);

      // assert
      expect(JSON.parse(read('src/i18n/lang.en.json')).loc.b).toBeUndefined();
      expect(JSON.parse(read('src/i18n/lang.de.json')).loc.b).toBeUndefined();
    });

    it('merges keys in the catalogs and in the sources', async () => {
      // arrange
      write('src/i18n/lang.en.json', { loc: { keep: 'Same', drop: 'Same' } });
      write('src/i18n/lang.de.json', { loc: { keep: 'Gleich', drop: 'Gleich' } });
      write('src/other.ts', "t('loc.drop');\nt('loc.dropped');\n");

      // act
      const outcome = await engine.commands.editCatalog(
        projectId,
        { kind: 'merge-keys', keep: 'loc.keep', remove: ['loc.drop'] },
        false,
      );

      // assert
      expect(JSON.parse(read('src/i18n/lang.en.json'))).toEqual({ loc: { keep: 'Same' } });
      expect(read('src/other.ts')).toBe("t('loc.keep');\nt('loc.dropped');\n");
      expect(outcome.files).toContain('src/other.ts');
    });

    it('adds a locale as a copy of the base locale, and refuses one that exists or is unknown', async () => {
      // act
      const outcome = await engine.commands.editCatalog(
        projectId,
        { kind: 'add-locale', locale: 'fr' },
        false,
      );

      // assert
      expect(outcome.files).toEqual(['src/i18n/lang.fr.json']);
      expect(read('src/i18n/lang.fr.json')).toBe(read('src/i18n/lang.en.json'));
      await expect(
        engine.commands.editCatalog(projectId, { kind: 'add-locale', locale: 'fr' }, false),
      ).rejects.toThrow('already has the catalog lang.fr.json');
      await expect(
        engine.commands.editCatalog(projectId, { kind: 'add-locale', locale: 'xx' }, false),
      ).rejects.toThrow('does not know the locale');
    });
  });

  describe('catalog queries', () => {
    it('searches, filters and flags keys by namespace', () => {
      // arrange
      write('src/i18n/lang.en.json', {
        loc: { nav: { home: 'Home {0}', start: 'Home {0}' }, form: { used: 'Used' } },
      });
      write('src/panel.html', "{{ 'loc.form.used' | translate }}\n");

      // act
      const overview = engine.catalogs.overview(projectId, true);
      const all = engine.catalogs.keys({
        projectId,
        namespace: null,
        search: '',
        filter: 'all',
        targetLocale: 'de',
        limit: 100,
      });
      const unused = engine.catalogs.keys({
        projectId,
        namespace: null,
        search: '',
        filter: 'unused',
        targetLocale: 'de',
        limit: 100,
      });
      const inNav = engine.catalogs.keys({
        projectId,
        namespace: 'nav',
        search: 'start',
        filter: 'all',
        targetLocale: 'de',
        limit: 100,
      });

      // assert
      expect(overview.namespaces.map((namespace) => namespace.name)).toContain('nav');
      expect(all.rows.find((row) => row.key === 'loc.nav.home')?.flags).toEqual([
        'duplicate',
        'unused',
        'placeholder',
      ]);
      expect(unused.rows.map((row) => row.key)).not.toContain('loc.form.used');
      expect(inNav).toMatchObject({ matching: 1, total: 2, rows: [{ key: 'loc.nav.start' }] });
    });

    it('names the usages and findings of a key', () => {
      // act
      const detail = engine.catalogs.keyDetail(projectId, 'loc.a', 'de');
      const identical = engine.catalogs.keyDetail(projectId, 'loc.b', 'de');

      // assert
      expect(detail.usages).toEqual([{ file: 'src/panel.html', line: 3 }]);
      expect(detail.comment).toBe('');
      expect(identical.findings).toEqual([
        'No source below src uses this key.',
        'The value in de is identical to en.',
      ]);
    });
  });

  describe('settings', () => {
    it('saves values and folders into the file they come from, as one change set', async () => {
      // arrange
      mkdirSync(join(repository, 'locales'));
      writeFileSync(join(repository, 'locales/lang.en.json'), '{"x":"X"}');

      // act
      const outcome = await engine.commands.updateSettings(
        projectId,
        { prefix: 'app', usedKeys: ['loc.*'], removeResourceRoots: [0] },
        { sourceRoot: null, addResourceRoots: [join(repository, 'locales')] },
        false,
      );

      // assert
      expect(outcome.files).toEqual(['wortlaut.config.json']);
      expect(JSON.parse(read('wortlaut.config.json')).actions).toMatchObject({
        detect: { resourceKey: { prefix: 'app' }, resourceRoot: ['../locales'] },
        analyze: { usedKeys: ['loc.*'] },
      });
      expect(engine.projects.settings(projectId).resourceRoots).toEqual(['locales']);
    });

    it('writes the choices of setup into a new configuration file, and keeps them when a later setting goes first', async () => {
      // arrange
      rmSync(join(repository, 'wortlaut.config.json'));

      const registered = engine.workspaces.register({
        inspection: engine.inspector.inspect(repository),
        workspace: { kind: 'existing', id: workspaceId },
        preset: 'angular',
        baseLocale: 'en',
        targetLocales: ['de'],
      });
      const { project } = engine.workspaces.requireProject(registered.projectId);

      // act
      const outcome = await engine.commands.addException(
        registered.projectId,
        'identicalValues',
        'Bee',
        false,
      );
      const pendingInit = await engine.commands
        .writeSetupConfiguration(project, true)
        .catch((error: Error) => error.message);

      // assert
      expect(outcome.files).toEqual(['wortlaut.config.json']);
      expect(JSON.parse(read('wortlaut.config.json')).actions).toMatchObject({
        detect: { preset: 'angular', languages: ['en', 'de'] },
        analyze: { baseLocale: 'en', identicalValues: ['Bee'] },
      });
      expect(pendingInit).toContain('already has the configuration file');
    });

    it('proposes the configuration file of a set-up project, which then reads the same', async () => {
      // arrange
      rmSync(join(repository, 'wortlaut.config.json'));

      const registered = engine.workspaces.register({
        inspection: engine.inspector.inspect(repository),
        workspace: { kind: 'existing', id: workspaceId },
        preset: 'angular',
        baseLocale: 'en',
        targetLocales: ['de'],
      });
      const { project } = engine.workspaces.requireProject(registered.projectId);
      const before = engine.projects.settings(registered.projectId);

      // act
      const pending = await engine.commands.writeSetupConfiguration(project, true);

      // assert
      expect(pending?.state).toBe('pending');
      expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);

      // act
      await engine.applyChangeSet(pending?.changeSetId as string, repository);

      // assert
      expect(engine.projects.settings(registered.projectId)).toMatchObject({
        sourceRoot: before.sourceRoot,
        resourceRoots: before.resourceRoots,
        baseLocale: 'en',
        preset: 'angular',
      });
    });
  });

  describe('toConfigurationFile', () => {
    it('turns paths relative to the project into the shape of a file and leaves empty values out', () => {
      // act
      const settings = toConfigurationFile('/work/shop', {
        actions: {
          detect: { root: 'src', resourceRoot: 'src/i18n', preset: '', languages: ['en'] },
        },
      });

      // assert
      expect(settings).toEqual({
        actions: { detect: { root: 'src', resourceRoot: ['i18n'], languages: ['en'] } },
      });
    });
  });

  describe('review', () => {
    it('shows the diff of a pending change set without a path, and says when a file changed since', async () => {
      // arrange
      const outcome = await engine.commands.editCatalog(
        projectId,
        { kind: 'set-value', key: 'loc.b', locale: 'de', value: 'Biene' },
        true,
      );
      const id = outcome.changeSetId as string;

      // act
      const detail = engine.review.detail(id);

      // assert
      expect(detail).toMatchObject({ command: 'catalog.edit', projectName: 'shop', conflicts: [] });
      expect(detail.files[0]).toMatchObject({
        file: 'src/i18n/lang.de.json',
        action: 'update',
        additions: 1,
        deletions: 1,
        hasConflict: false,
      });
      expect(
        detail.files[0].hunks[0].lines
          .filter((line) => line.kind !== 'context')
          .map((line) => line.text.trim()),
      ).toEqual(['"b": "Bee",', '"b": "Biene",']);
      expect(JSON.stringify(detail)).not.toContain(root);

      // act
      write('src/i18n/lang.de.json', { other: 'Change' });

      // assert
      expect(engine.review.list(workspaceId)[0].conflicts).toEqual(['src/i18n/lang.de.json']);
      await expect(engine.applyChangeSet(id, repository)).rejects.toThrow(
        'src/i18n/lang.de.json changed since the change set was built',
      );
    });
  });

  describe('test lab', () => {
    it('runs the real detector on a text and writes nothing', () => {
      // act
      const result = engine.testLab.detect(
        'angular' as never,
        'panel.html',
        "<h2>{{ 'Ready to go' | translate }}</h2>\n<p>{{ 'loc.a' | translate }}</p>",
        'loc',
      );

      // assert
      expect(result).toMatchObject({ detector: 'AngularHTMLDetector', failure: null });
      expect(result.matches).toEqual([
        { line: 1, column: 4, value: 'Ready to go', isHardCoded: true },
        { line: 2, column: 3, value: 'loc.a', isHardCoded: false },
      ]);
      expect(JSON.parse(result.resource)).toEqual({
        'loc.ready.to.go': 'Ready to go',
        'loc.a': 'loc.a',
      });
    });

    it('says when a preset does not read a file type', () => {
      // act
      const result = engine.testLab.detect('lit' as never, 'panel.html', '<p></p>', 'loc');

      // assert
      expect(result.detector).toBeNull();
      expect(result.failure).toBe('Lit reads .ts, and no .html.');
    });

    it('derives its samples from the preset', () => {
      // act
      const presets = engine.testLab.testPresets('app');

      // assert
      expect(
        presets.find((preset) => preset.id === 'lit')?.samples.map((sample) => sample.fileName),
      ).toEqual(['panel.ts']);
      expect(presets.find((preset) => preset.id === 'angular')?.samples[0].content).toContain(
        "'app.orders.title'",
      );
    });

    it('tests a pattern in the grammar of its list', () => {
      // arrange
      const keys = ['loc.a.b', 'loc.c', 'other'];

      // act & assert
      expect(engine.testLab.pattern('loc.*', 'usedKeys', keys)).toMatchObject({
        matchCount: 2,
        total: 3,
        error: null,
      });
      expect(
        engine.testLab
          .pattern('loc.{a,c}', 'usedKeys', keys)
          .keys.filter((key) => key.isMatch)
          .map((key) => key.key),
      ).toEqual(['loc.c']);
      expect(engine.testLab.pattern('loc.{a,c}', 'identicalKeys', keys).matchCount).toBe(0);
      expect(engine.testLab.pattern('', 'usedKeys', keys).error).toBe(
        'An empty entry matches no key.',
      );
      expect(engine.testLab.pattern('{a', 'usedKeys', keys).error).toContain(
        "The entry '{a' is invalid",
      );
    });
  });

  describe('runs', () => {
    it('repeats a stored run with its options under the current dry run', async () => {
      // arrange
      await engine.commands.run(
        { command: 'sort', projectId, input: { order: 'asc' } },
        { dryRun: true, runId: 'first-1' },
      );

      const record = engine.runs.get('first-1');

      // act
      const result = await engine.commands.repeat(record!, projectId, {
        dryRun: false,
        runId: 'again-1',
      });

      // assert
      expect(engine.runs.get('again-1')).toMatchObject({
        command: 'sort',
        writeMode: 'apply',
        options: { order: 'asc' },
      });
      expect(result.output?.command === 'sort' && result.output.rows[0].state).toBe('written');
      expect(Object.keys(JSON.parse(read('src/i18n/lang.en.json')).loc)).toEqual([
        'a',
        'b',
        'saved',
      ]);
    });

    it('prints what a command does as a line that holds no absolute path', () => {
      // act & assert
      expect(
        engine.commands.print({
          command: 'detect',
          projectId,
          input: { preset: 'angular', suffix: '.label', skipTests: true },
        }),
      ).toBe(
        'npx wortlaut detect --preset angular --root src --type json --resource-key-prefix loc --resource-key-suffix .label --skip-tests',
      );
      expect(
        engine.commands.print({
          command: 'transform',
          projectId,
          input: { types: ['ts', 'resx'] },
        }),
      ).toBe('npx wortlaut transform --types ts,resx --type json --resource-root src/i18n');
      expect(engine.commands.print({ command: 'sort', projectId, input: { order: 'desc' } })).toBe(
        'npx wortlaut sort --order desc --type json --resource-root src/i18n',
      );
    });
  });
});

describe('ProjectCommands.writeBatch', () => {
  let root: string;
  let repository: string;
  let engine: WortlautEngine;
  let projects: Array<string>;

  /**
   * Runs a command on every project the way Run on all projects does, and writes when all of them have ended.
   */
  async function runAll(
    command: 'sort',
    dryRun: boolean,
    wasStopped = false,
  ): Promise<{
    results: Array<RunResult>;
    writes: ReturnType<WortlautEngine['commands']['writeBatch']>;
  }> {
    const changes = new Array<IBatchChange>();
    const results = new Array<RunResult>();

    for (const [index, projectId] of projects.entries()) {
      const runId = `run-${index}`;

      // eslint-disable-next-line no-await-in-loop
      results.push(
        await engine.commands.runConfigured(projectId, command, {
          runId,
          dryRun,
          collectChanges: (changeSet, writeMode) =>
            changes.push({ runId, projectId, changeSet, writeMode }),
        }),
      );
    }

    return { results, writes: engine.commands.writeBatch(changes, wasStopped) };
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-batch-')));
    repository = join(root, 'repo');

    for (const name of ['one', 'two']) {
      mkdirSync(join(repository, 'libs', name, 'i18n'), { recursive: true });
      writeFileSync(
        join(repository, 'libs', name, 'i18n', 'lang.en.json'),
        JSON.stringify({ b: 'B', a: 'A' }),
      );
      writeFileSync(
        join(repository, 'libs', name, 'wortlaut.config.json'),
        JSON.stringify({ actions: { detect: { resourceRoot: 'i18n' } } }),
      );
    }

    engine = new WortlautEngine({
      surface: 'desktop',
      logger: { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
    });

    const { workspaceId } = engine.workspaces.create({
      name: 'Mono',
      code: 'MO',
      color: 'teal',
      repository,
    });

    projects = engine.workspaces.require(workspaceId).projects.map((project) => project.id);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves one change set for the repository under Dry run, and writes nothing', async () => {
    // act
    const { writes } = await runAll('sort', true);

    // assert
    expect(projects).toHaveLength(2);
    expect(engine.listChangeSets()).toHaveLength(1);
    expect(
      engine
        .listChangeSets()[0]
        .files.map((file) => file.displayPath)
        .sort(),
    ).toEqual(['libs/one/i18n/lang.en.json', 'libs/two/i18n/lang.en.json']);
    expect(engine.listChangeSets()[0].cwd).toBe(repository);
    expect(readFileSync(join(repository, 'libs', 'one', 'i18n', 'lang.en.json'), 'utf8')).toContain(
      '"b":"B"',
    );
    expect(writes.map((write) => write.outcome?.state)).toEqual(['pending', 'pending']);
  });

  it('writes the repository at once with Dry run off, and each run keeps one record with its own files', async () => {
    // act
    const { writes } = await runAll('sort', false);

    // assert
    expect(engine.listChangeSets()).toEqual([]);
    expect(
      JSON.parse(readFileSync(join(repository, 'libs', 'two', 'i18n', 'lang.en.json'), 'utf8')),
    ).toEqual({ a: 'A', b: 'B' });
    expect(writes.map((write) => write.outcome?.state)).toEqual(['applied', 'applied']);

    const records = engine.runs.list().filter((run) => run.command === 'sort');

    expect(records).toHaveLength(2);
    expect(
      records.every(
        (record) => record.changeSet?.state === 'applied' && record.changeSet.files.length === 1,
      ),
    ).toBe(true);
  });

  it('writes no file of the repository when one of them changed meanwhile, and names it', async () => {
    // arrange
    const changes = new Array<IBatchChange>();

    for (const [index, projectId] of projects.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await engine.commands.runConfigured(projectId, 'sort', {
        runId: `run-${index}`,
        dryRun: false,
        collectChanges: (changeSet, writeMode) =>
          changes.push({ runId: `run-${index}`, projectId, changeSet, writeMode }),
      });
    }

    writeFileSync(
      join(repository, 'libs', 'two', 'i18n', 'lang.en.json'),
      JSON.stringify({ z: 'Z' }),
    );

    // act
    const writes = engine.commands.writeBatch(changes, false);

    // assert
    expect(
      writes.every((write) => write.outcome === null && write.failure?.includes('lang.en.json')),
    ).toBe(true);
    expect(readFileSync(join(repository, 'libs', 'one', 'i18n', 'lang.en.json'), 'utf8')).toContain(
      '"b":"B"',
    );
  });

  it('never writes what a stopped batch finished: it waits in Review, marked as partial', async () => {
    // act
    const { writes } = await runAll('sort', false, true);

    // assert
    const [pending] = engine.listChangeSets();

    expect(pending.partial).toBe(true);
    expect(writes.map((write) => write.outcome?.state)).toEqual(['pending', 'pending']);
    expect(readFileSync(join(repository, 'libs', 'one', 'i18n', 'lang.en.json'), 'utf8')).toContain(
      '"b":"B"',
    );
  });
});
