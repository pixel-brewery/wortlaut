// #region Imports

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import type { IResourceGeneratorStrategy } from '@pixel-brewery/wortlaut-ai';
import {
  ChangeSetSchema,
  CommandReportSchema,
  RunRecordSchema,
  type RunRecord,
} from '@pixel-brewery/wortlaut-contracts';
import {
  Presets,
  ResourceMode,
  ResourceType,
  type IResourceModel,
} from '@pixel-brewery/wortlaut-core';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from './errors/EngineError';
import type { IGenerateOptions } from './interfaces/ICommandOptions';
import { WortlautEngine, type IEngineInit } from './WortlautEngine';

// #endregion

const SECRET = 'sk-very-secret-key';

describe('WortlautEngine', () => {
  let root: string;
  let i18n: string;
  let profile: string;
  let en: string;
  let de: string;
  let unsorted: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-engine-')));
    i18n = join(root, 'i18n');
    profile = join(root, 'profile');
    en = join(i18n, 'lang.en.json');
    de = join(i18n, 'lang.de.json');
    unsorted = JSON.stringify({ loc: { b: 'B', a: 'A' } });
    mkdirSync(i18n);
    writeFileSync(en, unsorted);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function createEngine(init: Partial<IEngineInit> = {}): WortlautEngine {
    return new WortlautEngine({
      surface: 'cli',
      logger: createLogger(),
      profileRoot: profile,
      env: {},
      ...init,
    });
  }

  function sort(engine: WortlautEngine, writeMode?: 'apply' | 'review' | 'dry-run') {
    return engine.sort({
      cwd: root,
      writeMode,
      options: { resourceRoot: [i18n], type: ResourceMode.Json, order: 'asc' },
    });
  }

  function pending(): Array<string> {
    return existsSync(join(profile, 'changes')) ? readdirSync(join(profile, 'changes')) : [];
  }

  function lastRun(engine: WortlautEngine): RunRecord {
    return engine.runs.list()[0];
  }

  describe('sort', () => {
    it('builds a change set and applies it straight away by default', async () => {
      // arrange
      const engine = createEngine();

      // act
      const outcome = await sort(engine);

      // assert
      expect(readFileSync(en, 'utf8')).toBe(JSON.stringify({ loc: { a: 'A', b: 'B' } }, null, 2));
      expect(outcome.changeSet?.state).toBe('applied');
      expect(outcome.changeSet?.files.map((file) => file.oldContent)).toEqual([unsorted]);
      expect(pending()).toEqual([]);
    });

    it('reports the same result as before for callers of run()', async () => {
      // act
      const outcome = await sort(createEngine());

      // assert
      expect(outcome.result.map((resource) => normalize(resource.path))).toEqual([en]);
    });

    it('leaves a catalog in order untouched, whatever its formatting', async () => {
      // arrange
      const formatted = '{"loc":   {"a":"A","b":"B"}}';
      writeFileSync(en, formatted);

      // act
      const outcome = await sort(createEngine());

      // assert
      expect(readFileSync(en, 'utf8')).toBe(formatted);
      expect(outcome.changeSet).toBeNull();
    });

    it('writes nothing in a dry run and leaves nothing to review, but reports and records it', async () => {
      // arrange
      const engine = createEngine();

      // act
      const outcome = await sort(engine, 'dry-run');

      // assert
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
      expect(pending()).toEqual([]);
      expect(outcome.report.changeSet?.state).toBe('proposed');
      expect(outcome.report.changeSet?.files.map((file) => file.displayPath)).toEqual([
        'i18n/lang.en.json',
      ]);
      expect(lastRun(engine)).toMatchObject({
        command: 'sort',
        dryRun: true,
        writeMode: 'dry-run',
        state: 'succeeded',
      });
    });

    it('leaves the change set in the review list when asked to, and writes nothing', async () => {
      // arrange
      const engine = createEngine();

      // act
      const outcome = await sort(engine, 'review');

      // assert
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
      expect(engine.listChangeSets().map((changeSet) => changeSet.id)).toEqual([
        outcome.changeSet?.id,
      ]);
      expect(outcome.changeSet?.state).toBe('pending');
    });

    it('leaves nothing to review when nothing changes', async () => {
      // arrange
      writeFileSync(en, JSON.stringify({ a: 'A' }));

      // act
      await sort(createEngine(), 'review');

      // assert
      expect(pending()).toEqual([]);
    });

    it('fails like before when the catalogs do not exist, and records the failure', async () => {
      // arrange
      const engine = createEngine();

      // act & assert
      await expect(
        engine.sort({
          cwd: root,
          options: { resourceRoot: [join(root, 'nope')], type: ResourceMode.Json, order: 'asc' },
        }),
      ).rejects.toThrow(/not a valid directory|does not exist/);
      expect(lastRun(engine).state).toBe('failed');
    });
  });

  describe('review list', () => {
    it('applies a pending change set from another process and records it', async () => {
      // arrange
      const { changeSet } = await sort(createEngine(), 'review');
      const otherProcess = createEngine();

      // act
      const outcome = await otherProcess.applyChangeSet(changeSet?.id as string, root);

      // assert
      expect(readFileSync(en, 'utf8')).toBe(JSON.stringify({ loc: { a: 'A', b: 'B' } }, null, 2));
      expect(otherProcess.listChangeSets()).toEqual([]);
      expect(outcome.report.changeSet?.state).toBe('applied');
      expect(lastRun(otherProcess)).toMatchObject({ command: 'changes.apply', state: 'succeeded' });
    });

    it('fails an apply when a file changed in between, names it and keeps the set in the list', async () => {
      // arrange
      const engine = createEngine();
      const { changeSet } = await sort(engine, 'review');
      writeFileSync(en, 'edited meanwhile');

      // act
      const error = (await engine
        .applyChangeSet(changeSet?.id as string, root)
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('change-set-conflict');
      expect(error.message).toContain('i18n/lang.en.json');
      expect(readFileSync(en, 'utf8')).toBe('edited meanwhile');
      expect(engine.listChangeSets()).toHaveLength(1);
      expect(lastRun(engine)).toMatchObject({
        command: 'changes.apply',
        state: 'failed',
        failure: { code: 'change-set-conflict', files: ['i18n/lang.en.json'] },
      });
    });

    it('discards a pending change set without writing', async () => {
      // arrange
      const engine = createEngine();
      const { changeSet } = await sort(engine, 'review');

      // act
      await engine.discardChangeSet(changeSet?.id as string, root);

      // assert
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
      expect(engine.listChangeSets()).toEqual([]);
      expect(lastRun(engine).command).toBe('changes.discard');
    });

    it('shows a pending change set with its contents', async () => {
      // arrange
      const engine = createEngine();
      const { changeSet } = await sort(engine, 'review');

      // act
      const stored = engine.getChangeSet(changeSet?.id as string);

      // assert
      expect(ChangeSetSchema.parse(stored).files[0].oldContent).toBe(unsorted);
    });

    it('says so for a change set that is not there', async () => {
      // act
      const error = (await createEngine()
        .applyChangeSet('nope', root)
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('change-set-not-found');
    });
  });

  describe('transform', () => {
    it('writes the converted catalogs and leaves the source alone', async () => {
      // arrange
      const engine = createEngine();

      // act
      const outcome = await engine.transform({
        cwd: root,
        options: { resourceRoot: [i18n], type: ResourceMode.Json, types: [ResourceType.Resx] },
      });

      // assert
      expect(readFileSync(join(i18n, 'lang.en.resx'), 'utf8')).toContain('<data name="loc.b"');
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
      expect(outcome.changeSet?.files.map((file) => [file.displayPath, file.action])).toEqual([
        ['i18n/lang.en.resx', 'create'],
      ]);
    });

    it('does not touch a file that is up to date', async () => {
      // arrange
      const engine = createEngine();
      await engine.transform({
        cwd: root,
        options: { resourceRoot: [i18n], type: ResourceMode.Json, types: [ResourceType.Resx] },
      });

      // act
      const outcome = await engine.transform({
        cwd: root,
        options: { resourceRoot: [i18n], type: ResourceMode.Json, types: [ResourceType.Resx] },
      });

      // assert
      expect(outcome.changeSet).toBeNull();
    });

    it('leaves a TypeScript target alone that a formatter reformatted, as long as its keys and values are the same', async () => {
      // arrange
      const engine = createEngine();
      const target = join(i18n, 'lang.en.ts');
      await engine.transform({
        cwd: root,
        options: {
          resourceRoot: [i18n],
          type: ResourceMode.Json,
          types: [ResourceType.TypeScript],
        },
      });
      const reformatted = readFileSync(target, 'utf8').replace(/\n/g, '\n\n');
      writeFileSync(target, reformatted);

      // act
      const outcome = await engine.transform({
        cwd: root,
        options: {
          resourceRoot: [i18n],
          type: ResourceMode.Json,
          types: [ResourceType.TypeScript],
        },
      });

      // assert
      expect(outcome.changeSet).toBeNull();
      expect(readFileSync(target, 'utf8')).toBe(reformatted);
    });

    it('writes nothing at all when a later target fails', async () => {
      // act & assert
      await expect(
        createEngine().transform({
          cwd: root,
          options: {
            resourceRoot: [i18n],
            type: ResourceMode.Json,
            types: [ResourceType.Resx, 'unknown' as never],
          },
        }),
      ).rejects.toThrow(/No serializer/);
      expect(readdirSync(i18n)).toEqual(['lang.en.json']);
    });
  });

  describe('generate', () => {
    function options(overrides: Partial<IGenerateOptions> = {}): IGenerateOptions {
      return {
        resourceRoot: [i18n],
        type: ResourceMode.Json,
        strategy: 'fake',
        locales: ['de'],
        baseLocale: 'en',
        apiKey: SECRET,
        model: 'model',
        temperature: 0,
        chunkSize: 1,
        limit: null,
        instructions: '',
        onlyNew: false,
        scope: 'all',
        namespace: '',
        identicalKeys: [],
        identicalValues: [],
        dumpModels: false,
        ...overrides,
      };
    }

    function createFakeProvider(
      behave: (models: Array<IResourceModel>, call: number) => Promise<Array<IResourceModel>>,
    ) {
      let call = 0;
      const strategy = {
        on: vi.fn(),
        transcribe: vi.fn((data: { models: Array<IResourceModel> }) => behave(data.models, ++call)),
      };

      return {
        strategy,
        strategies: new Map([['fake', strategy as unknown as IResourceGeneratorStrategy]]),
      };
    }

    const translate = (models: Array<IResourceModel>): Promise<Array<IResourceModel>> =>
      Promise.resolve(models.map((model) => ({ ...model, value: `${model.value} de` })));

    it('writes the translated catalog once the run has ended', async () => {
      // arrange
      const { strategies, strategy } = createFakeProvider(translate);

      // act
      const outcome = await createEngine({ strategies }).generate({
        cwd: root,
        options: options(),
      });

      // assert
      expect(strategy.transcribe).toHaveBeenCalledTimes(2);
      expect(JSON.parse(readFileSync(de, 'utf8'))).toEqual({ loc: { b: 'B de', a: 'A de' } });
      expect(outcome.changeSet?.state).toBe('applied');
      expect(outcome.report.data).toMatchObject({ status: 'completed' });
    });

    it('leaves the target untouched when a provider fails, and keeps the finished keys for review', async () => {
      // arrange
      writeFileSync(de, JSON.stringify({ loc: { a: 'Vorher' } }));
      const before = readFileSync(de, 'utf8');
      const { strategies } = createFakeProvider((models, call) =>
        call === 1 ? translate(models) : Promise.reject(new Error('quota exceeded')),
      );
      const engine = createEngine({ strategies });

      // act
      const error = (await engine
        .generate({ cwd: root, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('generation-failed');
      expect(error.message).toContain('quota exceeded');
      expect(readFileSync(de, 'utf8')).toBe(before);
      expect(error.changeSetId).not.toBeNull();

      const kept = engine.getChangeSet(error.changeSetId as string);

      expect(kept.partial).toBe(true);
      expect(JSON.parse(kept.files[0].newContent)).toEqual({ loc: { a: 'Vorher', b: 'B de' } });
      expect(lastRun(engine)).toMatchObject({
        command: 'generate',
        state: 'failed',
        changeSet: { id: error.changeSetId, partial: true },
      });
    });

    it('writes the finished keys only when the kept change set is applied', async () => {
      // arrange
      const { strategies } = createFakeProvider((models, call) =>
        call === 1 ? translate(models) : Promise.reject(new Error('quota exceeded')),
      );
      const engine = createEngine({ strategies });
      const error = (await engine
        .generate({ cwd: root, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // act
      await engine.applyChangeSet(error.changeSetId as string, root);

      // assert
      expect(JSON.parse(readFileSync(de, 'utf8'))).toEqual({ loc: { b: 'B de' } });
    });

    it('writes nothing and keeps nothing when a dry run fails', async () => {
      // arrange
      const { strategies } = createFakeProvider((models, call) =>
        call === 1 ? translate(models) : Promise.reject(new Error('quota exceeded')),
      );
      const engine = createEngine({ strategies });

      // act
      const error = (await engine
        .generate({ cwd: root, writeMode: 'dry-run', options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('generation-failed');
      expect(existsSync(de)).toBe(false);
      expect(pending()).toEqual([]);
    });

    it('fails without a change set when no chunk finished', async () => {
      // arrange
      const { strategies } = createFakeProvider(() => Promise.reject(new Error('offline')));
      const engine = createEngine({ strategies });

      // act
      const error = (await engine
        .generate({ cwd: root, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.changeSetId).toBeNull();
      expect(existsSync(de)).toBe(false);
      expect(pending()).toEqual([]);
    });

    it('writes nothing for a stopped run and keeps what it finished', async () => {
      // arrange
      const stop = new AbortController();
      const { strategies } = createFakeProvider((models) => {
        stop.abort();

        return translate(models);
      });
      const engine = createEngine({ strategies });

      // act
      const error = (await engine
        .generate({ cwd: root, signal: stop.signal, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('run-stopped');
      expect(existsSync(de)).toBe(false);
      expect(lastRun(engine).state).toBe('stopped');
      expect(engine.getChangeSet(error.changeSetId as string).partial).toBe(true);
    });

    it('fails the apply when the target changes while the provider works', async () => {
      // arrange
      writeFileSync(de, JSON.stringify({ loc: { a: 'Vorher' } }));
      const { strategies } = createFakeProvider((models) => {
        writeFileSync(de, JSON.stringify({ loc: { a: 'Von Hand geändert' } }));

        return translate(models);
      });
      const engine = createEngine({ strategies });

      // act
      const error = (await engine
        .generate({ cwd: root, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      expect(error.code).toBe('change-set-conflict');
      expect(JSON.parse(readFileSync(de, 'utf8'))).toEqual({ loc: { a: 'Von Hand geändert' } });
    });

    it('keeps the key out of the run, the change set, the logs and the error', async () => {
      // arrange
      const logger = createLogger();
      const { strategies } = createFakeProvider((models, call) =>
        call === 1 ? translate(models) : Promise.reject(new Error(`401 for key ${SECRET}`)),
      );
      const engine = createEngine({ strategies, logger });

      // act
      const error = (await engine
        .generate({ cwd: root, options: options() })
        .catch((failure: EngineError) => failure)) as EngineError;

      // assert
      const stored = [
        ...readdirSync(join(profile, 'runs')).map((name) =>
          readFileSync(join(profile, 'runs', name), 'utf8'),
        ),
        ...readdirSync(join(profile, 'changes')).map((name) =>
          readFileSync(join(profile, 'changes', name), 'utf8'),
        ),
      ];
      const logged = JSON.stringify(
        vi
          .mocked(logger.log)
          .mock.calls.concat(
            vi.mocked(logger.warn).mock.calls,
            vi.mocked(logger.info).mock.calls,
            vi.mocked(logger.error).mock.calls,
          ),
      );

      expect(stored.length).toBeGreaterThan(1);
      expect(stored.join('\n')).not.toContain(SECRET);
      expect(logged).not.toContain(SECRET);
      expect(error.message).not.toContain(SECRET);
      expect(error.stack).not.toContain(SECRET);
      expect(lastRun(engine).options).not.toHaveProperty('apiKey');
      expect(lastRun(engine).options).toMatchObject({ model: 'model', locales: ['de'] });
    });

    it('reads the key of a provider from the environment and keeps it out of the run', async () => {
      // arrange
      const logger = createLogger();
      const engine = createEngine({ logger, env: { OPENAI_API_KEY: SECRET } });

      // act
      const error = await engine
        .generate({ cwd: root, options: options({ apiKey: '', strategy: 'openai', locales: [] }) })
        .catch((failure: Error) => failure);

      // assert
      expect(error).not.toBeInstanceOf(Error);
      expect(JSON.stringify(lastRun(engine))).not.toContain(SECRET);
    });

    it('reports progress as events', async () => {
      // arrange
      const onProgress = vi.fn();
      const { strategies } = createFakeProvider(translate);

      // act
      await createEngine({ strategies, onProgress }).generate({ cwd: root, options: options() });

      // assert
      expect(
        onProgress.mock.calls.map(([event]) => [
          event.phase,
          event.completed,
          event.total,
          event.detail,
        ]),
      ).toEqual([
        ['generate', 0, 2, 'de'],
        ['generate', 1, 2, 'de'],
        ['generate', 2, 2, 'de'],
      ]);
    });

    it('carries a warning of the generator into the change set', async () => {
      // arrange
      const { strategies } = createFakeProvider((models, call) =>
        call === 1 ? Promise.resolve([]) : translate(models),
      );

      // act
      const outcome = await createEngine({ strategies }).generate({
        cwd: root,
        writeMode: 'review',
        options: options(),
      });

      // assert
      expect(outcome.changeSet?.findings.length).toBeGreaterThan(0);
      expect(outcome.changeSet?.findings[0]).toMatchObject({
        rule: 'generate',
        severity: 'warning',
        locale: 'de',
      });
    });

    it('fails for a base locale that does not exist', async () => {
      // arrange
      const { strategies } = createFakeProvider(translate);

      // act & assert
      await expect(
        createEngine({ strategies }).generate({
          cwd: root,
          options: options({ baseLocale: 'fr' }),
        }),
      ).rejects.toThrow('Base locale not found');
    });
  });

  describe('analyze', () => {
    it('reports findings, writes nothing and records them', async () => {
      // arrange
      writeFileSync(de, JSON.stringify({ loc: { b: 'B', a: 'A' } }));
      const engine = createEngine();

      // act
      const outcome = await engine.analyze({
        cwd: root,
        options: {
          resourceRoot: [i18n],
          type: ResourceMode.Json,
          root: '',
          preset: '',
          resourceKeyPrefix: '',
          resourceKeySuffix: '',
          rules: ['missing-translations'],
          usedKeys: [],
          baseLocale: 'en',
          identicalKeys: [],
          identicalValues: [],
        },
      });

      // assert
      expect(outcome.changeSet).toBeNull();
      expect(outcome.report.findings).toMatchObject([
        { rule: 'missing-translations', severity: 'error', locale: 'de' },
      ]);
      expect(lastRun(engine).findings).toHaveLength(1);
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
    });

    it('runs all rules but unused-keys without sources', async () => {
      // act
      const outcome = await createEngine().analyze({
        cwd: root,
        options: {
          resourceRoot: [i18n],
          type: ResourceMode.Json,
          root: '',
          preset: '',
          resourceKeyPrefix: '',
          resourceKeySuffix: '',
          rules: [],
          usedKeys: [],
          baseLocale: 'en',
          identicalKeys: [],
          identicalValues: [],
        },
      });

      // assert
      expect(outcome.result).toHaveLength(6);
    });
  });

  describe('detect', () => {
    it('finds strings and writes nothing', async () => {
      // arrange
      const source = join(root, 'src');
      mkdirSync(source);
      writeFileSync(join(source, 'view.ts'), `const title = translate('Hello world');`);

      // act
      const outcome = await createEngine().detect({
        cwd: root,
        options: {
          root: source,
          preset: Presets.Lit,
          type: ResourceMode.Json,
          resourceKeyPrefix: 'loc',
          resourceKeySuffix: '',
        },
      });

      // assert
      expect(outcome.changeSet).toBeNull();
      expect(JSON.stringify(outcome.report.data)).toContain('Hello world');
      expect(readdirSync(source)).toEqual(['view.ts']);
    });
  });

  describe('info', () => {
    it('reports the machine', async () => {
      // act
      const outcome = await createEngine().info(root);

      // assert
      expect(outcome.result.cpus).toBeGreaterThan(0);
      expect(outcome.report.data).toEqual(outcome.result);
    });
  });

  describe('init', () => {
    it('creates the configuration file through a change set', async () => {
      // act
      const outcome = await createEngine().init({
        cwd: root,
        options: { settings: { actions: { detect: { root: 'src' } } }, force: false },
      });

      // assert
      expect(JSON.parse(readFileSync(join(root, 'wortlaut.config.json'), 'utf8'))).toEqual({
        actions: { detect: { root: 'src' } },
      });
      expect(outcome.changeSet?.files[0].action).toBe('create');
    });

    it('writes nothing in a dry run', async () => {
      // act
      await createEngine().init({
        cwd: root,
        writeMode: 'dry-run',
        options: { settings: {}, force: false },
      });

      // assert
      expect(existsSync(join(root, 'wortlaut.config.json'))).toBe(false);
    });

    it('keeps a configuration file that exists, also the fallback, unless forced', async () => {
      // arrange
      writeFileSync(join(root, 'localizator.config.json'), '{}');
      const engine = createEngine();

      // act & assert
      await expect(
        engine.init({ cwd: root, options: { settings: {}, force: false } }),
      ).rejects.toThrow(/already has/);
      await expect(
        engine.init({ cwd: root, options: { settings: {}, force: true } }),
      ).resolves.toBeDefined();
    });

    it('refuses a key in the file', async () => {
      // act & assert
      await expect(
        createEngine().init({
          cwd: root,
          options: { settings: { actions: { generate: { apiKey: SECRET } } }, force: false },
        }),
      ).rejects.toThrow(/free of secrets/);
      expect(existsSync(join(root, 'wortlaut.config.json'))).toBe(false);
    });
  });

  describe('setConfiguration', () => {
    it('writes a setting through a change set and records no refused secret', async () => {
      // arrange
      const engine = createEngine();
      const configuration = engine.resolveConfiguration({ cwd: root });

      // act
      await engine.setConfiguration(configuration, {
        cwd: root,
        options: { key: 'actions.sort.order', value: 'desc' },
      });
      const failed = await engine
        .setConfiguration(configuration, {
          cwd: root,
          options: { key: 'actions.generate.apiKey', value: SECRET },
        })
        .catch((failure: Error) => failure);

      // assert
      expect(JSON.parse(readFileSync(join(root, 'wortlaut.config.json'), 'utf8'))).toEqual({
        actions: { sort: { order: 'desc' } },
      });
      expect(failed).toBeInstanceOf(EngineError);
      expect(JSON.stringify(engine.runs.list())).not.toContain(SECRET);
    });
  });

  describe('runs', () => {
    it('records command, surface, options, log and instants of a run', async () => {
      // arrange
      const instants = [new Date('2026-11-02T10:00:00.000Z'), new Date('2026-11-02T10:00:01.500Z')];
      const engine = createEngine({ surface: 'nx', now: () => instants.shift() as Date });

      // act
      const outcome = await sort(engine);

      // assert
      const run = RunRecordSchema.parse(lastRun(engine));

      expect(run.id).toBe(outcome.report.runId);
      expect(run).toMatchObject({
        command: 'sort',
        surface: 'nx',
        state: 'succeeded',
        dryRun: false,
        cwd: root,
        startedAt: '2026-11-02T10:00:00.000Z',
        finishedAt: '2026-11-02T10:00:01.500Z',
        durationMs: 1500,
        options: { order: 'asc', type: 'json' },
      });
      expect(run.log.some((entry) => entry.message.includes('Running sort on resources'))).toBe(
        true,
      );
      expect(run.changeSet?.files[0].displayPath).toBe('i18n/lang.en.json');
      expect(JSON.stringify(run.changeSet)).not.toContain('newContent');
    });

    it('does not fail a command on a machine without a writable profile', async () => {
      // arrange
      const blocked = join(root, 'blocked');
      writeFileSync(blocked, 'a file where the profile should be');
      const engine = createEngine({ profileRoot: blocked });

      // act
      const outcome = await sort(engine);

      // assert
      expect(outcome.report.runId).toBeNull();
      expect(readFileSync(en, 'utf8')).not.toBe(unsorted);
    });

    it('says so when a review cannot be stored, and writes nothing', async () => {
      // arrange
      const blocked = join(root, 'blocked');
      writeFileSync(blocked, 'a file where the profile should be');

      // act
      const error = (await sort(createEngine({ profileRoot: blocked }), 'review').catch(
        (failure: EngineError) => failure,
      )) as EngineError;

      // assert
      expect(error.code).toBe('review-list-unavailable');
      expect(readFileSync(en, 'utf8')).toBe(unsorted);
    });
  });

  it('logs through the injected logger and never to the console', async () => {
    // arrange
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const logger = createLogger();

    try {
      // act
      await sort(createEngine({ logger }));

      // assert
      expect(vi.mocked(logger.log)).toHaveBeenCalled();

      for (const call of consoleCalls) {
        expect(call).not.toHaveBeenCalled();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('hands out a report that matches its contract', async () => {
    // act
    const { report } = await sort(createEngine());

    // assert
    expect(CommandReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
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
