// #region Imports

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;
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
    generate: { locales: ['de'], instructions: 'Keep Wortlaut.' },
  },
};

interface IProposalData {
  state: string;
  changeSetId: string | null;
  files: Array<string>;
  accepted: number;
  rejected: Array<{ key: string; problem: string }>;
  findings: Array<string>;
}

describe('AssistantCommands', () => {
  let root: string;
  let repository: string;
  let engine: WortlautEngine;
  let projectId: string;

  const write = (path: string, content: unknown): void => {
    const file = join(repository, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    );
  };
  const read = (path: string): string => readFileSync(join(repository, path), 'utf8');
  const propose = (rows: Array<{ key: string; value: string }>, locale = 'de') =>
    engine.assistants.proposeTranslations({ projectId, locale, rows, client: 'codex' }, repository);
  const next = (limit = 2, locale = 'de') =>
    engine.assistants.nextTranslations({ projectId, locale, namespace: null, limit }, repository);

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-assistants-')));
    repository = join(root, 'shop');
    write('wortlaut.config.json', CONFIG);
    write('src/i18n/lang.en.json', { loc: { hello: 'Hello {0}', bye: 'Bye', open: 'Open' } });
    write('src/i18n/lang.de.json', { loc: { open: 'Öffnen' } });
    write('src/app.html', "<p>{{ 'Keep editing' | translate }}</p>");
    engine = new WortlautEngine({
      surface: 'mcp',
      logger: LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
      restrictToKnownRoots: true,
    });
    ({ projectId } = engine.workspaces.register({
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

  describe('next translations', () => {
    it('hands over what the catalog lacks, with its context', async () => {
      // act
      const { data, result } = (await next()) as {
        data: {
          keys: Array<{ key: string; base: string; placeholders: Array<string> }>;
          remaining: number;
          baseLocale: string;
          instructions: Array<string>;
        };
        result: string;
      };

      // assert
      expect(data.keys.map((key) => key.key)).toEqual(['loc.hello', 'loc.bye']);
      expect(data.keys[0]).toMatchObject({ base: 'Hello {0}', placeholders: ['{0}'] });
      expect(data.remaining).toBe(0);
      expect(data.baseLocale).toBe('en');
      expect(data.instructions).toEqual(['Keep Wortlaut.']);
      expect(result).toBe('2 keys for German');
    });

    it('leaves out what waits in the review list, and works it out again every time', async () => {
      // arrange
      const before = (await next()) as { data: { keys: Array<{ key: string }> } };

      await propose([{ key: 'loc.bye', value: 'Tschüss' }]);

      // act
      const after = (await next()) as {
        data: { keys: Array<{ key: string }>; waitingInReview: number };
      };

      // assert
      expect(before.data.keys).toHaveLength(2);
      expect(after.data.keys.map((key) => key.key)).toEqual(['loc.hello']);
      expect(after.data.waitingInReview).toBe(1);
    });

    it('hands the keys over again when the change set is discarded', async () => {
      // arrange
      const proposal = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
      };

      await engine.discardChangeSet(proposal.data.changeSetId as string, repository);

      // act
      const after = (await next()) as { data: { keys: Array<{ key: string }> } };

      // assert
      expect(after.data.keys.map((key) => key.key)).toEqual(['loc.hello', 'loc.bye']);
    });
  });

  describe('proposing translations', () => {
    it('leaves a pending change set in the review list and writes nothing', async () => {
      // arrange
      const catalog = read('src/i18n/lang.de.json');

      // act
      const { data, result, runId } = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
        result: string;
        runId: string;
      };

      // assert
      expect(read('src/i18n/lang.de.json')).toBe(catalog);
      expect(data.state).toBe('pending');
      expect(engine.listChangeSets().map((changeSet) => changeSet.id)).toEqual([data.changeSetId]);
      expect(engine.listChangeSets()[0].source).toMatchObject({
        command: 'translations.propose',
        surface: 'mcp',
        detail: 'Codex: translations for de',
      });
      expect(result).toBe('1 keys, waiting for review');
      expect(engine.runs.get(runId)?.options).toEqual({ locale: 'de', count: 1, client: 'codex' });
    });

    it('runs the same checks as a translation: a lost placeholder and an empty value are refused, and the rest goes on', async () => {
      // act
      const { data } = (await propose([
        { key: 'loc.hello', value: 'Hallo' },
        { key: 'loc.bye', value: '' },
        { key: 'loc.open', value: 'Auf' },
      ])) as { data: IProposalData };

      // assert
      expect(data.accepted).toBe(1);
      expect(data.rejected).toEqual([
        { key: 'loc.hello', problem: 'Placeholder {0} is missing' },
        { key: 'loc.bye', problem: 'The translation is empty' },
      ]);
      expect(engine.getChangeSet(data.changeSetId as string).files[0].newContent).toContain(
        '"open": "Auf"',
      );
    });

    it('takes a key only from the catalog: an invented key never reaches a change set', async () => {
      // act
      const { data } = (await propose([{ key: 'loc.invented', value: 'Erfunden' }])) as {
        data: IProposalData;
      };

      // assert
      expect(data.rejected).toEqual([
        { key: 'loc.invented', problem: 'The base catalog holds no such key.' },
      ]);
      expect(data.state).toBe('unchanged');
      expect(engine.listChangeSets()).toEqual([]);
    });

    it('lets a project that does not protect placeholders take the row, with a finding for the reviewer', async () => {
      // arrange
      write('wortlaut.config.json', {
        actions: {
          ...CONFIG.actions,
          generate: { ...CONFIG.actions.generate, protectPlaceholders: false },
        },
      });

      // act
      const { data } = (await propose([{ key: 'loc.hello', value: 'Hallo' }])) as {
        data: IProposalData;
      };

      // assert
      expect(data.accepted).toBe(1);
      expect(data.findings).toEqual(['loc.hello: Placeholder {0} is missing']);
      expect(engine.getChangeSet(data.changeSetId as string).findings[0].message).toBe(
        'loc.hello: Placeholder {0} is missing',
      );
    });

    it('puts a proposal in several parts into one change set, so approving it leaves no conflict behind', async () => {
      // arrange
      await propose([{ key: 'loc.bye', value: 'Tschüss' }]);

      // act
      const { data } = (await propose([{ key: 'loc.hello', value: 'Hallo {0}' }])) as {
        data: IProposalData;
      };

      await engine.applyChangeSet(data.changeSetId as string, repository);

      // assert
      expect(engine.listChangeSets()).toEqual([]);
      expect(JSON.parse(read('src/i18n/lang.de.json'))).toEqual({
        loc: { open: 'Öffnen', bye: 'Tschüss', hello: 'Hallo {0}' },
      });
    });

    it('leaves an earlier proposal alone when its catalog changed meanwhile, and approving that one shows the conflict', async () => {
      // arrange
      const first = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
      };

      write('src/i18n/lang.de.json', { loc: { open: 'Auf' } });

      // act
      const second = (await propose([{ key: 'loc.hello', value: 'Hallo {0}' }])) as {
        data: IProposalData;
      };

      // assert
      expect(
        engine
          .listChangeSets()
          .map((changeSet) => changeSet.id)
          .sort(),
      ).toEqual([first.data.changeSetId, second.data.changeSetId].sort());
      await expect(
        engine.applyChangeSet(first.data.changeSetId as string, repository),
      ).rejects.toThrow(/src\/i18n\/lang\.de\.json changed since/);
    });

    it('creates the catalog of a new locale in the shape of the base catalog', async () => {
      // act
      const { data } = (await propose([{ key: 'loc.bye', value: 'Au revoir' }], 'fr')) as {
        data: IProposalData;
      };

      // assert
      expect(data.files).toEqual(['src/i18n/lang.fr.json']);
      expect(
        JSON.parse(engine.getChangeSet(data.changeSetId as string).files[0].newContent),
      ).toEqual({ loc: { bye: 'Au revoir' } });
    });
  });

  describe('proposing keys', () => {
    it('leaves the source and the catalog in one pending change set', async () => {
      // arrange
      const scan = (await engine.assistants.detect(projectId, repository)) as {
        data: { scanId: string; rows: Array<{ rowId: string; value: string }> };
      };
      const source = read('src/app.html');

      // act
      const { data } = (await engine.assistants.proposeKeys(
        {
          projectId,
          scanId: scan.data.scanId,
          rows: [{ rowId: scan.data.rows[0].rowId, key: 'loc.keepEditing' }],
        },
        repository,
      )) as { data: IProposalData };

      // assert
      expect(data.state).toBe('pending');
      expect(data.accepted).toBe(1);
      expect(read('src/app.html')).toBe(source);
      expect(
        engine
          .getChangeSet(data.changeSetId as string)
          .files.map((file) => file.displayPath)
          .sort(),
      ).toEqual(['src/app.html', 'src/i18n/lang.en.json']);
    });

    it('holds a name to the rules of a key, as it does a name a provider proposes', async () => {
      // arrange
      const scan = (await engine.assistants.detect(projectId, repository)) as {
        data: { scanId: string; rows: Array<{ rowId: string }> };
      };
      const rowId = scan.data.rows[0].rowId;

      // act
      const noPrefix = (await engine.assistants.proposeKeys(
        { projectId, scanId: scan.data.scanId, rows: [{ rowId, key: 'keepEditing' }] },
        repository,
      )) as { data: IProposalData };
      const taken = (await engine.assistants.proposeKeys(
        { projectId, scanId: scan.data.scanId, rows: [{ rowId, key: 'loc.bye' }] },
        repository,
      )) as { data: IProposalData };
      const unknown = (await engine.assistants.proposeKeys(
        { projectId, scanId: scan.data.scanId, rows: [{ rowId: 'nothing', key: 'loc.x' }] },
        repository,
      )) as { data: IProposalData };

      // assert
      expect(noPrefix.data.rejected[0].problem).toBe(
        'The name keepEditing breaks the rules of a key.',
      );
      expect(taken.data.rejected[0].problem).toBe('The name loc.bye is taken.');
      expect(unknown.data.rejected[0].problem).toContain('no such string');
      expect(engine.listChangeSets()).toEqual([]);
    });
  });

  describe('applying', () => {
    it('writes a pending change set with the check of Approve', async () => {
      // arrange
      const { data } = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
      };

      // act
      const applied = await engine.assistants.applyChanges(
        { id: data.changeSetId as string, dryRun: false },
        repository,
      );

      // assert
      expect(applied.result).toBe('1 file written');
      expect(JSON.parse(read('src/i18n/lang.de.json')).loc.bye).toBe('Tschüss');
      expect(engine.listChangeSets()).toEqual([]);
    });

    it('fails on a file that changed since, names it, writes nothing and keeps the change set', async () => {
      // arrange
      const { data } = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
      };

      write('src/i18n/lang.de.json', { loc: { open: 'Auf' } });

      // act
      const applying = engine.assistants.applyChanges(
        { id: data.changeSetId as string, dryRun: false },
        repository,
      );

      // assert
      await expect(applying).rejects.toThrow(/src\/i18n\/lang\.de\.json changed since/);
      expect(JSON.parse(read('src/i18n/lang.de.json'))).toEqual({ loc: { open: 'Auf' } });
      expect(engine.listChangeSets().map((changeSet) => changeSet.id)).toEqual([data.changeSetId]);
    });

    it('only reports in a dry run, conflicts included', async () => {
      // arrange
      const { data } = (await propose([{ key: 'loc.bye', value: 'Tschüss' }])) as {
        data: IProposalData;
      };
      const clean = (await engine.assistants.applyChanges(
        { id: data.changeSetId as string, dryRun: true },
        repository,
      )) as { data: { wouldWrite: Array<string>; conflicts: Array<string> } };

      write('src/i18n/lang.de.json', { loc: { open: 'Auf' } });

      // act
      const conflicted = (await engine.assistants.applyChanges(
        { id: data.changeSetId as string, dryRun: true },
        repository,
      )) as { data: { conflicts: Array<string> } };

      // assert
      expect(clean.data).toMatchObject({ wouldWrite: ['src/i18n/lang.de.json'], conflicts: [] });
      expect(conflicted.data.conflicts).toEqual(['src/i18n/lang.de.json']);
      expect(JSON.parse(read('src/i18n/lang.de.json'))).toEqual({ loc: { open: 'Auf' } });
      expect(engine.listChangeSets()).toHaveLength(1);
    });

    it('refuses a change set with a file outside of every known project, and writes nothing', async () => {
      // arrange
      const outside = join(root, 'outside');

      mkdirSync(outside);
      writeFileSync(join(outside, 'wortlaut.config.json'), JSON.stringify(CONFIG));
      mkdirSync(join(outside, 'src/i18n'), { recursive: true });
      writeFileSync(join(outside, 'src/i18n/lang.en.json'), JSON.stringify({ z: 'Z', a: 'A' }));

      const local = new WortlautEngine({
        surface: 'cli',
        logger: LOGGER,
        profileRoot: join(root, 'profile'),
        home: root,
        env: {},
      });
      const sorted = await local.sort({
        cwd: outside,
        options: { resourceRoot: [join(outside, 'src/i18n')], type: 'json', order: 'asc' } as never,
        writeMode: 'review',
      });

      // act
      const applying = engine.assistants.applyChanges(
        { id: sorted.changeSet?.id as string, dryRun: false },
        repository,
      );

      // assert
      await expect(applying).rejects.toThrow(/outside of the folders you chose/);
      expect(JSON.parse(readFileSync(join(outside, 'src/i18n/lang.en.json'), 'utf8'))).toEqual({
        z: 'Z',
        a: 'A',
      });
    });
  });

  describe('paths', () => {
    it('refuses a project whose configuration points out of the folders the user chose', async () => {
      // arrange
      write('wortlaut.config.json', {
        actions: {
          ...CONFIG.actions,
          detect: { ...CONFIG.actions.detect, resourceRoot: ['../../outside'] },
        },
      });
      mkdirSync(join(root, 'outside'));
      writeFileSync(
        join(root, 'outside', 'lang.en.json'),
        JSON.stringify({ secret: 'text of another folder' }),
      );

      // act
      const reading = engine.assistants.searchKeys(
        { projectId, query: '', namespace: null, locale: null, limit: 10 },
        repository,
      );

      // assert
      await expect(reading).rejects.toThrow(/is outside of the workspace/);
    });

    it('does not read a catalog folder that is a link out of the project', async () => {
      // arrange
      mkdirSync(join(root, 'outside'));
      writeFileSync(
        join(root, 'outside', 'lang.en.json'),
        JSON.stringify({ secret: 'text of another folder' }),
      );
      rmSync(join(repository, 'src/i18n'), { recursive: true });
      symlinkSync(join(root, 'outside'), join(repository, 'src/i18n'));

      // act
      const reading = engine.assistants.searchKeys(
        { projectId, query: '', namespace: null, locale: null, limit: 10 },
        repository,
      );

      // assert
      await expect(reading).rejects.toThrow(/outside of the folders you chose/);
    });

    it('does not follow a catalog folder that is a link out of the project', async () => {
      // arrange
      mkdirSync(join(root, 'outside'));
      writeFileSync(join(root, 'outside', 'lang.en.json'), JSON.stringify({ z: 'Z', a: 'A' }));
      rmSync(join(repository, 'src/i18n'), { recursive: true });
      symlinkSync(join(root, 'outside'), join(repository, 'src/i18n'));

      // act
      const sorting = engine.assistants.sort(
        { projectId, order: 'asc', dryRun: false },
        repository,
      );

      // assert
      await expect(sorting).rejects.toThrow(/outside of the folders you chose/);
      expect(JSON.parse(readFileSync(join(root, 'outside', 'lang.en.json'), 'utf8'))).toEqual({
        z: 'Z',
        a: 'A',
      });
    });

    it('refuses a folder that belongs to no known project', async () => {
      // act
      const reading = engine.assistants.getConfig(null, root);

      // assert
      await expect(reading).rejects.toThrow(/belongs to no project/);
    });

    it('finds the project the server was started in, by its deepest folder', async () => {
      // act
      const { data } = (await engine.assistants.listProjects(join(repository, 'src'))) as {
        data: { projects: Array<{ id: string; isDefault: boolean }> };
      };
      const config = await engine.assistants.getConfig(null, join(repository, 'src'));

      // assert
      expect(data.projects).toEqual([expect.objectContaining({ id: projectId, isDefault: true })]);
      expect(config.result).toMatch(/\d+ settings/);
    });

    it('stops the guard of an engine at every write, not only at a tool', async () => {
      // arrange
      mkdirSync(join(root, 'outside'));
      writeFileSync(join(root, 'outside', 'lang.en.json'), JSON.stringify({ z: 'Z', a: 'A' }));

      // act
      const sorting = engine.sort({
        cwd: repository,
        options: { resourceRoot: [join(root, 'outside')], type: 'json', order: 'asc' } as never,
        writeMode: 'review',
      });

      // assert
      await expect(sorting).rejects.toThrow(/outside of the folders you chose/);
      expect(engine.listChangeSets()).toEqual([]);
    });
  });

  describe('writes of the level Write', () => {
    it('writes straight away, whatever the dry run of the app says, and one run holds it', async () => {
      // act
      const outcome = (await engine.assistants.sort(
        { projectId, order: 'asc', dryRun: false },
        repository,
      )) as { data: { state: string; files: Array<string> }; result: string; runId: string };

      // assert
      expect(outcome.data.state).toBe('applied');
      expect(outcome.result).toBe('1 files written');
      expect(Object.keys(JSON.parse(read('src/i18n/lang.en.json')).loc)).toEqual([
        'bye',
        'hello',
        'open',
      ]);
      expect(engine.runs.get(outcome.runId)).toMatchObject({
        command: 'sort',
        surface: 'mcp',
        writeMode: 'apply',
        dryRun: false,
      });
      expect(engine.listChangeSets()).toEqual([]);
    });

    it('only reports in a dry run: it stores nothing and writes nothing', async () => {
      // arrange
      const catalog = read('src/i18n/lang.en.json');

      // act
      const outcome = (await engine.assistants.sort(
        { projectId, order: 'asc', dryRun: true },
        repository,
      )) as {
        data: { state: string; files: Array<string>; dryRun: boolean };
        result: string;
        runId: string;
      };

      // assert
      expect(outcome.data).toMatchObject({
        state: 'unchanged',
        dryRun: true,
        files: ['src/i18n/lang.en.json'],
      });
      expect(outcome.result).toBe('Dry run: 1 files would be written');
      expect(read('src/i18n/lang.en.json')).toBe(catalog);
      expect(engine.listChangeSets()).toEqual([]);
      expect(engine.runs.get(outcome.runId)).toMatchObject({ writeMode: 'dry-run', dryRun: true });
    });

    it('generates another format as a change set of the same run', async () => {
      // act
      const outcome = (await engine.assistants.transform(
        { projectId, types: ['po'], dryRun: false },
        repository,
      )) as { data: { state: string }; result: string };

      // assert
      expect(outcome.data.state).toBe('applied');
      expect(existsSync(join(repository, 'src/i18n/lang.en.po'))).toBe(true);
    });
  });

  describe('reads', () => {
    it('tags no read as a dry run, because it never writes', async () => {
      // act
      const detect = await engine.assistants.detect(projectId, repository);
      const analyze = await engine.assistants.analyze(projectId, null, repository);
      const config = await engine.assistants.getConfig(projectId, repository);

      // assert
      for (const outcome of [detect, analyze, config]) {
        expect(engine.runs.get(outcome.runId as string)?.dryRun).toBe(false);
        expect(outcome.runId).toMatch(/-read$/);
      }
    });

    it('finds keys and values', async () => {
      // act
      const { data, result } = (await engine.assistants.searchKeys(
        { projectId, query: 'bye', namespace: null, locale: 'de', limit: 10 },
        repository,
      )) as {
        data: { rows: Array<{ key: string; base: string; target: string | null }> };
        result: string;
      };

      // assert
      expect(data.rows).toEqual([
        expect.objectContaining({ key: 'loc.bye', base: 'Bye', target: null }),
      ]);
      expect(result).toBe('1 key found');
    });

    it('stops a pattern that backtracks without end, instead of hanging the server', async () => {
      // arrange
      write('src/i18n/lang.en.json', { [`${'a'.repeat(60)}b`]: 'A' });

      // act
      const startedAt = Date.now();
      const { data } = (await engine.assistants.testPattern(
        { projectId, pattern: '/(a+)+$/', list: 'usedKeys' },
        repository,
      )) as { data: { error: string | null; matchCount: number } };

      // assert
      expect(data.error).toContain('stopped');
      expect(data.matchCount).toBe(0);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    });

    it('shows which keys a pattern covers', async () => {
      // act
      const { data, result } = (await engine.assistants.testPattern(
        { projectId, pattern: 'loc.b*', list: 'usedKeys' },
        repository,
      )) as { data: { matches: Array<string> }; result: string };

      // assert
      expect(data.matches).toEqual(['loc.bye']);
      expect(result).toBe('1 of 3 keys');
    });

    it('records a refusal as a failed run, so it shows up with the rest', async () => {
      // act
      const runId = await engine.assistants.recordRefusal('sort', 'Not at this level.', repository);

      engine.assistants.note(runId as string, {
        client: 'codex',
        tool: 'sort',
        result: 'Not at this level.',
      });

      // assert
      expect(engine.runs.get(runId as string)).toMatchObject({
        state: 'failed',
        command: 'mcp.read',
        assistant: { client: 'codex', tool: 'sort' },
      });
      expect(engine.projects.mcpActivity(5)).toEqual([
        expect.objectContaining({
          tool: 'sort',
          client: 'Codex',
          result: 'Not at this level.',
          state: 'failed',
        }),
      ]);
    });
  });
});
