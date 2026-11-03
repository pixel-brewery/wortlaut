// #region Imports

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { IAiProviderHost, IAiProviderInfo, IResourceGeneratorStrategy } from '@pixel-brewery/wortlaut-ai';
import type { GenerateInput, IpcRequest, RunResult } from '@pixel-brewery/wortlaut-contracts';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

/**
 * An obvious test value. No real provider is called from a spec.
 */
const KEY = 'test-key-not-real';

const LOGGER = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as ILogger;

type Rows = Array<{ key: string; value: string }>;
type Answer = (rows: Rows, call: number) => Promise<unknown>;

describe('GenerateService', () => {
    let root: string;
    let repository: string;
    let engine: WortlautEngine;
    let projectId: string;
    let answer: Answer;
    let calls: Array<{ models: Rows; instructions: unknown }>;
    let states: Partial<Record<string, IAiProviderInfo['state']>>;

    const write = (path: string, content: unknown): void => {
        const file = join(repository, path);

        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
    };
    const read = (path: string): string => readFileSync(join(repository, path), 'utf8');
    const translated = (rows: Rows): Array<{ key: string; value: string; comment: string }> => rows.map(({ key, value }) => ({ key, value: `${value} [fr]`, comment: '' }));
    const input = (change: Partial<GenerateInput> = {}): GenerateInput => ({
        locales: ['fr'],
        scope: 'all',
        namespace: null,
        keys: null,
        limit: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        chunkSize: 2,
        instructions: 'Keep Wortlaut.',
        reviewBeforeWriting: true,
        protectPlaceholders: true,
        ...change
    });

    /**
     * Starts a run the way a host does, and returns when its first chunk was asked for.
     */
    function start(change: Partial<GenerateInput> = {}, dryRun = true, signal?: AbortSignal): { runId: string; done: Promise<RunResult> } {
        const runId = `run-${calls.length}-${Date.now()}`;
        const request: IpcRequest<'run.start'> = { command: 'generate', projectId, input: input(change) };

        return { runId, done: engine.commands.run(request as never, { runId, dryRun, ...signal ? { signal } : {} }) };
    }

    function pendingChangeSets(): Array<string> {
        return engine.listChangeSets().map((changeSet) => changeSet.id);
    }

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-generate-')));
        repository = join(root, 'shop');
        calls = [];
        states = {};
        answer = (rows) => Promise.resolve(translated(rows));
        write('wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: ['i18n'], preset: 'angular', type: 'json', resourceKey: { prefix: 'loc' } }, analyze: { baseLocale: 'en' }, generate: { locales: ['fr'], localeInstructions: { fr: 'Use tu.' } } } });
        write('src/i18n/lang.en.json', { loc: { a: { one: 'One', two: 'Two {0}' }, b: { three: 'Three' } } });

        const strategy: IResourceGeneratorStrategy = {
            on: vi.fn() as never,
            transcribe: (data, _locale, options) => {
                calls.push({ models: data.models, instructions: options?.instructions });

                return answer(data.models, calls.length) as never;
            }
        };
        const ai: IAiProviderHost = {
            list: () => Promise.resolve([]),
            get: (id) => Promise.resolve({ id, name: id, kind: 'key', state: states[id] ?? 'ready', description: 'A provider' }),
            prepare: () => Promise.resolve({ strategy, secrets: [KEY] }),
            models: () => Promise.resolve([]),
            testKey: () => Promise.resolve({ ok: true, message: '' }),
            installHint: () => '',
            dispose: () => Promise.resolve()
        };

        engine = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot: join(root, 'profile'), home: root, env: {}, ai, retryDelayMs: 0 });
        ({ projectId } = engine.workspaces.register({
            inspection: engine.inspector.inspect(repository),
            workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
            preset: 'angular',
            baseLocale: 'en',
            targetLocales: ['fr']
        }));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe('what a setup would take', () => {
        it('counts the keys and chunks of a setup, with the tokens as an estimate', () => {
            // act
            const estimate = engine.generation.estimate(projectId, input());

            // assert
            expect(estimate).toMatchObject({ keys: 3, chunks: 2 });
            expect(estimate.estimatedTokens).toBeGreaterThan(0);
        });

        it('applies scope, namespace, limit and explicit keys', () => {
            // act & assert
            expect(engine.generation.estimate(projectId, input({ namespace: 'loc.a' })).keys).toBe(2);
            expect(engine.generation.estimate(projectId, input({ namespace: 'loc.a', limit: 1 })).keys).toBe(1);
            expect(engine.generation.estimate(projectId, input({ keys: ['loc.b.three'] })).keys).toBe(1);
        });

        it('knows the scopes new and missing from the catalog of the target', () => {
            // arrange
            write('src/i18n/lang.fr.json', { loc: { a: { one: 'Un', two: 'Two {0}' } } });

            // act & assert
            expect(engine.generation.estimate(projectId, input({ scope: 'new' })).keys).toBe(1);
            expect(engine.generation.estimate(projectId, input({ scope: 'missing' })).keys).toBe(2);
        });

        it('shows the real prompt, with the instructions apart from the catalog text', () => {
            // act
            const text = engine.generation.prompt(projectId, input());

            // assert
            expect(text).toContain('Translate a locale json content from en to fr.');
            expect(text.indexOf('Keep Wortlaut.')).toBeLessThan(text.indexOf('catalog-data'));
            expect(text.indexOf('Use tu.')).toBeLessThan(text.indexOf('catalog-data'));
            expect(text).toContain('Two {0}');
        });

        it('prints a command that follows every control and holds no key', () => {
            // act
            const line = engine.generation.command(projectId, input({ provider: 'claude-code', scope: 'missing', namespace: 'loc.a', limit: 5, instructions: 'Say it nicely.' })).command;

            // assert
            expect(line).toContain('--strategy claude-code');
            expect(line).toContain('--scope missing');
            expect(line).toContain('--namespace loc.a');
            expect(line).toContain('--limit 5');
            expect(line).toContain('--instructions \'Say it nicely.\'');
            expect(line).not.toContain('--model');
            expect(line).not.toContain('--temperature');
            expect(line).not.toContain(KEY);
        });

        it('lists the targets with how far they are, and the namespaces with the start of their keys', () => {
            // arrange
            write('src/i18n/lang.de.json', { loc: { a: { one: 'One' } } });

            // act
            const overview = engine.generation.overview(projectId);

            // assert
            expect(overview.targets).toEqual(expect.arrayContaining([
                { locale: 'fr', isNew: true, missing: 3, identical: 0, selected: true },
                { locale: 'de', isNew: false, missing: 2, identical: 1, selected: false }
            ]));
            expect(overview.namespaces).toEqual(expect.arrayContaining([{ name: 'a', path: 'loc.a', count: 2 }]));
        });
    });

    describe('a run with a review', () => {
        it('holds the rows for review and writes nothing to a catalog', async () => {
            // act
            const { runId, done } = start();
            const result = await done;
            const run = engine.generation.get(runId, 'fr');

            // assert
            expect(result.state).toBe('succeeded');
            expect(run.status).toBe('done');
            expect(run.rows.map((row) => [row.key, row.value, row.accepted])).toEqual([['loc.a.one', 'One [fr]', true], ['loc.a.two', 'Two {0} [fr]', true], ['loc.b.three', 'Three [fr]', true]]);
            expect(run.locales[0]).toMatchObject({ doneKeys: 3, totalKeys: 3, doneChunks: 2, totalChunks: 2, writable: 3 });
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
            expect(run.changeSetId).not.toBeNull();
            expect(run.partial).toBe(false);
        });

        it('sends the instructions of the setup and of the locale with every chunk', async () => {
            // act
            await start().done;

            // assert
            expect(calls[0].instructions).toEqual(['Keep Wortlaut.', 'Use tu.']);
        });

        it('never lets a chunk that stays wrong reach the review: the run waits at that chunk', async () => {
            // arrange
            answer = (rows, call) => call === 1 ? Promise.resolve(translated(rows)) : Promise.resolve([{ key: 'not.a.key', value: 'x' }]);

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(engine.generation.get(runId, 'fr').status).toBe('failed'));

            const failed = engine.generation.get(runId, 'fr');

            // assert
            expect(calls).toHaveLength(4);
            expect(failed.failure).toMatchObject({ locale: 'fr', chunk: 2, canResume: true });
            expect(failed.rows.map((row) => row.key)).toEqual(['loc.a.one', 'loc.a.two']);
            expect(failed.locales[0].chunks).toEqual(['done', 'failed']);

            engine.generation.stop(runId);
            await done;
        });

        it('goes on from the failed chunk, and asks no finished chunk again', async () => {
            // arrange
            let isDown = true;

            answer = (rows, call) => call > 1 && isDown ? Promise.reject(new Error('The provider rate limit was reached.')) : Promise.resolve(translated(rows));

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(engine.generation.get(runId, 'fr').status).toBe('failed'));
            expect(engine.generation.get(runId, 'fr').failure?.message).toContain('rate limit');
            isDown = false;
            engine.generation.resume(runId);
            await done;

            // assert
            expect(engine.generation.get(runId, 'fr').status).toBe('done');
            expect(calls.filter((call) => call.models[0].key === 'loc.a.one')).toHaveLength(1);
            expect(engine.generation.get(runId, 'fr').rows).toHaveLength(3);
        });

        it('finishes the chunk in flight on pause, starts no new one, and goes on when resumed', async () => {
            // arrange
            let release: () => void = () => undefined;

            answer = (rows, call) => call === 1 ? new Promise((resolve) => {
                release = () => resolve(translated(rows));
            }) : Promise.resolve(translated(rows));

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(calls).toHaveLength(1));
            engine.generation.pause(runId);
            release();
            await vi.waitFor(() => expect(engine.generation.get(runId, 'fr').locales[0].doneChunks).toBe(1));
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });

            // assert
            expect(engine.generation.get(runId, 'fr').status).toBe('paused');
            expect(calls).toHaveLength(1);

            engine.generation.resume(runId);
            await done;
            expect(calls).toHaveLength(2);
            expect(engine.generation.get(runId, 'fr').status).toBe('done');
        });

        it('writes nothing for a stopped run, and keeps what it finished in a pending change set marked partial', async () => {
            // arrange
            answer = (rows, call) => call === 1 ? Promise.resolve(translated(rows)) : new Promise(() => undefined);

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(calls).toHaveLength(2));

            const before = read('src/i18n/lang.en.json');

            engine.generation.stop(runId);

            const result = await done;
            const run = engine.generation.get(runId, 'fr');

            // assert
            expect(result.state).toBe('stopped');
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
            expect(read('src/i18n/lang.en.json')).toBe(before);
            expect(run.status).toBe('stopped');
            expect(run.partial).toBe(true);
            expect(engine.getChangeSet(run.changeSetId as string).partial).toBe(true);
            expect(JSON.parse(engine.getChangeSet(run.changeSetId as string).files[0].newContent)).toEqual({ loc: { a: { one: 'One [fr]', two: 'Two {0} [fr]' } } });
        });

        it('stops like a stop when the app quits, also from a failed or paused state', async () => {
            // arrange
            const controller = new AbortController();

            answer = () => Promise.reject(new Error('down'));

            // act
            const { runId, done } = start({}, true, controller.signal);

            await vi.waitFor(() => expect(engine.generation.get(runId, 'fr').status).toBe('failed'));
            controller.abort();

            // assert
            await expect(done).resolves.toMatchObject({ state: 'stopped' });
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
        });

        it('keeps nothing when Keep partial results is off', async () => {
            // arrange
            write('wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: ['i18n'], preset: 'angular', type: 'json' }, generate: { locales: ['fr'], keepPartialResults: false } } });
            answer = (rows, call) => call === 1 ? Promise.resolve(translated(rows)) : new Promise(() => undefined);

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(calls).toHaveLength(2));
            engine.generation.stop(runId);
            await done;

            // assert
            expect(pendingChangeSets()).toEqual([]);
        });

        it('fails a provider that is not set up without starting anything', async () => {
            // arrange
            states = { 'claude-code': 'signed-out' };

            // act
            const { runId, done } = start({ provider: 'claude-code' });
            const result = await done;

            // assert
            expect(result.state).toBe('failed');
            expect(calls).toEqual([]);
            expect(engine.generation.get(runId, 'fr').failure).toMatchObject({ canResume: false });
        });

        it('never holds a key: not in a log, a run, a change set, a printed line or a failure', async () => {
            // arrange
            answer = (rows, call) => call === 1 ? Promise.resolve([...translated(rows), { key: KEY, value: 'A model that echoes what it found', comment: '' }]) : Promise.reject(new Error(`Incorrect API key provided: ${KEY}`));

            // act
            const { runId, done } = start();

            await vi.waitFor(() => expect(engine.generation.get(runId, 'fr').status).toBe('failed'));

            const failed = engine.generation.get(runId, 'fr');

            engine.generation.stop(runId);
            await done;

            const profile = readdirSync(join(root, 'profile'), { recursive: true, withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
                .join('\n');

            // assert
            expect(JSON.stringify(failed)).not.toContain(KEY);
            expect(failed.failure?.message).toContain('Incorrect API key');
            expect(profile).not.toContain(KEY);
            expect(engine.generation.command(projectId, input()).command).not.toContain(KEY);
        });
    });

    describe('the review', () => {
        const finish = async (rows: Array<{ key: string; value: string }>, change: Partial<GenerateInput> = {}): Promise<string> => {
            answer = () => Promise.resolve(rows);

            const { runId, done } = start({ chunkSize: 100, ...change });

            await done;

            return runId;
        };

        it('starts a flagged row not accepted, and with Protect placeholders it cannot be accepted', async () => {
            // act
            const runId = await finish([{ key: 'loc.a.one', value: 'One' }, { key: 'loc.a.two', value: 'Deux' }, { key: 'loc.b.three', value: 'Trois' }]);
            const { rows, checks } = engine.generation.get(runId, 'fr');

            // assert
            expect(rows[0]).toMatchObject({ severity: 'warning', accepted: false, note: 'Identical to English', canAccept: true });
            expect(rows[1]).toMatchObject({ severity: 'danger', accepted: false, note: 'Placeholder {0} is missing', canAccept: false });
            expect(rows[2]).toMatchObject({ severity: 'none', accepted: true });
            expect(checks.find((check) => check.id === 'placeholders')).toMatchObject({ severity: 'danger' });
            expect(checks.find((check) => check.id === 'identical')).toMatchObject({ severity: 'warning' });
            expect(() => engine.generation.setRow(runId, 'fr', 'loc.a.two', { accepted: true })).not.toThrow();
            expect(engine.generation.get(runId, 'fr').rows[1].accepted).toBe(false);
        });

        it('lets a flagged row be accepted with Protect placeholders off, but still flags it', async () => {
            // act
            const runId = await finish([{ key: 'loc.a.one', value: 'Un' }, { key: 'loc.a.two', value: 'Deux' }, { key: 'loc.b.three', value: 'Trois' }], { protectPlaceholders: false });
            const row = engine.generation.setRow(runId, 'fr', 'loc.a.two', { accepted: true });

            // assert
            expect(row).toMatchObject({ severity: 'danger', accepted: true, canAccept: true });
        });

        it('validates again after an edit', async () => {
            // arrange
            const runId = await finish([{ key: 'loc.a.one', value: 'Un' }, { key: 'loc.a.two', value: 'Deux' }, { key: 'loc.b.three', value: 'Trois' }]);

            // act
            const fixed = engine.generation.setRow(runId, 'fr', 'loc.a.two', { value: 'Deux {0}' });
            const broken = engine.generation.setRow(runId, 'fr', 'loc.a.one', { value: 'Un {9}' });

            // assert
            expect(fixed).toMatchObject({ severity: 'none', accepted: true, value: 'Deux {0}' });
            expect(broken).toMatchObject({ severity: 'danger', accepted: false, canAccept: false });
        });

        it('refuses to write with Dry run on or while it translates', async () => {
            // arrange
            const runId = await finish([{ key: 'loc.a.one', value: 'Un' }, { key: 'loc.a.two', value: 'Deux {0}' }, { key: 'loc.b.three', value: 'Trois' }]);

            // act & assert
            await expect(engine.commands.writeGenerated(runId, 'fr', true)).rejects.toThrow(/Dry run is on/);
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
        });

        it('writes the accepted rows as a change set that takes after the base catalog', async () => {
            // arrange
            const runId = await finish([{ key: 'loc.a.one', value: 'Un' }, { key: 'loc.a.two', value: 'Deux' }, { key: 'loc.b.three', value: 'Trois' }]);

            // act
            const outcome = await engine.commands.writeGenerated(runId, 'fr', false);
            const run = engine.generation.get(runId, 'fr');

            // assert
            expect(outcome).toMatchObject({ state: 'applied', files: ['src/i18n/lang.fr.json'] });
            expect(JSON.parse(read('src/i18n/lang.fr.json'))).toEqual({ loc: { a: { one: 'Un' }, b: { three: 'Trois' } } });
            expect(run.rows.filter((row) => row.written).map((row) => row.key)).toEqual(['loc.a.one', 'loc.b.three']);
            expect(run.locales[0].writable).toBe(0);
            expect(run.changeSetId).toBeNull();
            expect(pendingChangeSets()).toEqual([]);
        });

        it('keeps the order of an existing catalog and its other keys', async () => {
            // arrange
            write('src/i18n/lang.fr.json', { loc: { b: { three: 'Trois ancien' }, keep: 'Garde' } });

            const runId = await finish([{ key: 'loc.b.three', value: 'Trois' }], { keys: ['loc.b.three'] });

            // act
            await engine.commands.writeGenerated(runId, 'fr', false);

            // assert
            expect(read('src/i18n/lang.fr.json')).toBe(`${JSON.stringify({ loc: { b: { three: 'Trois' }, keep: 'Garde' } }, null, 2)}\n`);
        });

        it('fails the write and names the file when the target changed in between', async () => {
            // arrange
            write('src/i18n/lang.fr.json', { loc: { keep: 'Garde' } });

            const runId = await finish([{ key: 'loc.b.three', value: 'Trois' }], { keys: ['loc.b.three'] });
            const changed = `${JSON.stringify({ loc: { keep: 'Changed by someone' } }, null, 2)}\n`;

            write('src/i18n/lang.fr.json', changed);

            // act
            const run = engine.generation.get(runId, 'fr');

            // assert
            await expect(engine.applyChangeSet(run.changeSetId as string, repository)).rejects.toThrow(/lang\.fr\.json/);
            expect(read('src/i18n/lang.fr.json')).toBe(changed);
        });

        it('writes nothing when someone changed the target during the review, names it, and goes on top when asked again', async () => {
            // arrange
            write('src/i18n/lang.fr.json', { loc: { keep: 'Garde' } });

            const runId = await finish([{ key: 'loc.b.three', value: 'Trois' }], { keys: ['loc.b.three'] });
            const changed = { loc: { keep: 'Changed by someone' } };

            write('src/i18n/lang.fr.json', changed);

            // act & assert
            await expect(engine.commands.writeGenerated(runId, 'fr', false)).rejects.toThrow(/src\/i18n\/lang\.fr\.json changed since this run read it/);
            expect(JSON.parse(read('src/i18n/lang.fr.json'))).toEqual(changed);

            await engine.commands.writeGenerated(runId, 'fr', false);
            expect(JSON.parse(read('src/i18n/lang.fr.json'))).toEqual({ loc: { keep: 'Changed by someone', b: { three: 'Trois' } } });
        });

        it('applies right away at the end of a run with Review before writing and Dry run off', async () => {
            // arrange
            answer = (rows) => Promise.resolve(translated(rows));

            // act
            const result = await start({ reviewBeforeWriting: false }, false).done;

            // assert
            expect(result.outcome).toMatchObject({ state: 'applied' });
            expect(JSON.parse(read('src/i18n/lang.fr.json')).loc.a.one).toBe('One [fr]');
        });

        it('stays in Review with Review before writing off while Dry run is on', async () => {
            // act
            const result = await start({ reviewBeforeWriting: false }, true).done;

            // assert
            expect(result.outcome).toMatchObject({ state: 'pending' });
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
        });

        it('runs one locale at a time and answers for the locale a view asks for', async () => {
            // arrange
            write('wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: ['i18n'], preset: 'angular', type: 'json' }, generate: { locales: ['fr', 'de'] } } });

            // act
            const { runId, done } = start({ locales: ['fr', 'de'], chunkSize: 100 });

            await done;

            // assert
            expect(calls).toHaveLength(2);
            expect(engine.generation.get(runId, 'de').locale).toBe('de');
            expect(engine.generation.get(runId, 'fr').locales.map((entry) => entry.status)).toEqual(['done', 'done']);
        });
    });

    describe('the record of a run', () => {
        it('keeps the real duration and log of a translation when its accepted rows are written, in one record', async () => {
            // arrange
            let clock = Date.parse('2026-11-02T10:00:00.000Z');
            const profileRoot = join(root, 'timed-profile');
            const strategy: IResourceGeneratorStrategy = { on: vi.fn() as never, transcribe: (data) => {
                clock += 7400;

                return Promise.resolve(translated(data.models)) as never;
            } };
            const ai = { get: (id: string) => Promise.resolve({ id, name: id, kind: 'key', state: 'ready', description: '' }), prepare: () => Promise.resolve({ strategy, secrets: [] }), list: () => Promise.resolve([]) } as unknown as IAiProviderHost;
            const timed = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot, home: root, env: {}, ai, retryDelayMs: 0, now: () => new Date(clock) });
            const { projectId: id } = timed.workspaces.register({ inspection: timed.inspector.inspect(repository), workspace: { kind: 'new', name: 'Timed', code: 'T', color: 'teal' }, preset: 'angular', baseLocale: 'en', targetLocales: ['fr'] });
            const runId = 'run-timed';

            await timed.commands.run({ command: 'generate', projectId: id, input: input({ chunkSize: 10 }) } as never, { runId, dryRun: false });

            // act
            const outcome = await timed.commands.writeGenerated(runId, 'fr', false);
            const runs = timed.runs.list();
            const detail = timed.projects.runDetail(runId);

            // assert
            expect(runs.map((run) => run.id)).toEqual([runId]);
            expect(outcome.runId).toBe(runId);
            expect(runs[0].durationMs).toBe(7400);
            expect(detail?.log).toContain('Translating from en to fr');
            expect(detail?.log).toContain('Writing 3 accepted for fr');
            expect(detail?.changes).toEqual([{ file: 'src/i18n/lang.fr.json', action: 'create', state: 'applied' }]);
            expect(runs[0].writeMode).toBe('apply');
            expect(detail?.forReview).toBe(false);
        });

        it('notes in the log of the run that a write failed, and the run stays what it was', async () => {
            // arrange
            write('src/i18n/lang.fr.json', { loc: { a: { one: 'Eins' } } });

            const { runId, done } = start({}, false);

            await done;
            chmodSync(join(repository, 'src/i18n/lang.fr.json'), 0o444);

            // act
            const failed = await engine.commands.writeGenerated(runId, 'fr', false).catch((error: unknown) => error);
            const records = engine.runs.list().filter((run) => run.command === 'generate');

            // assert
            expect(failed).toBeInstanceOf(Error);
            expect(records).toHaveLength(1);
            expect(records[0].state).toBe('succeeded');
            expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
            expect(records[0].log.at(-1)).toMatchObject({ level: 'error', message: expect.stringContaining('read-only') });
        });
    });

    describe('the path of a run', () => {
        it('refuses a target outside of what the user chose, before it asks anyone', async () => {
            // arrange
            engine.generation.guardPaths((path) => {
                throw new Error(`This file lies outside: ${path}`);
            });

            // act
            const { done } = start();
            const result = await done;

            // assert
            expect(result).toMatchObject({ state: 'failed' });
            expect(result.failure).toContain('This file lies outside');
            expect(calls).toEqual([]);
        });
    });


    describe('comments', () => {
        it('sends the comments of a JSON project with the rows, as data', async () => {
            // arrange
            await engine.commands.editCatalog(projectId, { kind: 'set-comment', key: 'loc.a.one', locale: 'en', comment: 'On the save button' }, false);

            // act
            await start({ keys: ['loc.a.one'] }).done;

            // assert
            expect(calls[0].models[0]).toMatchObject({ key: 'loc.a.one', comment: 'On the save button' });
            expect(JSON.parse(read('wortlaut.comments.json'))).toEqual({ schemaVersion: 1, catalogs: { 'src/i18n/lang.json': { 'loc.a.one': 'On the save button' } } });
        });

        it('keeps a comment as a change set: with Dry run on it waits in Review', async () => {
            // act
            const outcome = await engine.commands.editCatalog(projectId, { kind: 'set-comment', key: 'loc.a.one', locale: 'en', comment: 'Note' }, true);

            // assert
            expect(outcome.state).toBe('pending');
            expect(existsSync(join(repository, 'wortlaut.comments.json'))).toBe(false);
        });

        it('shows the comment in the details of a key and reads no catalog from the comments file', async () => {
            // arrange
            write('wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: ['.'], preset: 'angular', type: 'json' }, analyze: { baseLocale: 'en' } } });

            // act
            await engine.commands.editCatalog(projectId, { kind: 'set-comment', key: 'loc.a.one', locale: 'en', comment: 'Note' }, false);

            // assert
            expect(engine.catalogs.keyDetail(projectId, 'loc.a.one', null).comment).toBe('Note');
            expect(engine.catalogs.overview(projectId, true).locales.map((locale) => locale.code)).not.toContain('comments');
        });

        it('takes a comment along when a key goes or merges', async () => {
            // arrange
            await engine.commands.editCatalog(projectId, { kind: 'set-comment', key: 'loc.a.one', locale: 'en', comment: 'One' }, false);
            await engine.commands.editCatalog(projectId, { kind: 'set-comment', key: 'loc.a.two', locale: 'en', comment: 'Two' }, false);

            // act
            await engine.commands.editCatalog(projectId, { kind: 'delete-key', key: 'loc.a.one' }, false);
            await engine.commands.editCatalog(projectId, { kind: 'merge-keys', keep: 'loc.b.three', remove: ['loc.a.two'] }, false);

            // assert
            expect(JSON.parse(read('wortlaut.comments.json')).catalogs['src/i18n/lang.json']).toEqual({ 'loc.b.three': 'Two' });
        });
    });

    describe('settings', () => {
        it('saves what changed as a change set in the repository, with Dry run on as a pending one', async () => {
            // arrange
            const { safety } = engine.generation.defaults(projectId);

            // act
            const outcome = await engine.commands.saveAiDefaults(projectId, { model: 'gpt-4o', temperature: 0.2, chunkSize: 20, limit: 50, instructions: 'Short.', localeInstructions: { fr: 'Use vous.' }, safety: { ...safety, keepRawOutput: true } }, true);

            // assert
            expect(outcome.state).toBe('pending');
            expect(JSON.parse(read('wortlaut.config.json')).actions.generate.chunkSize).toBeUndefined();

            const applied = await engine.commands.saveAiDefaults(projectId, { model: 'gpt-4o', temperature: 0.2, chunkSize: 20, limit: 50, instructions: 'Short.', localeInstructions: { fr: 'Use vous.' }, safety: { ...safety, keepRawOutput: true } }, false);
            const generate = JSON.parse(read('wortlaut.config.json')).actions.generate;

            expect(applied.state).toBe('applied');
            expect(generate).toMatchObject({ model: 'gpt-4o', temperature: 0.2, chunkSize: 20, limit: 50, instructions: 'Short.', localeInstructions: { fr: 'Use vous.' }, keepRawOutput: true });
            expect(engine.generation.defaults(projectId)).toMatchObject({ chunkSize: 20, limit: 50, safety: { keepRawOutput: true } });
        });

        it('keeps the default provider in the profile and not in the repository', () => {
            // act
            engine.aiPreferences.defaultProvider = 'codex';

            // assert
            expect(engine.generation.defaults(projectId).defaultProvider).toBe('codex');
            expect(read('wortlaut.config.json')).not.toContain('codex');
        });
    });

    describe('the test lab', () => {
        it('compares two setups over the one path, writes nothing and builds no change set', async () => {
            // arrange
            const request = { projectId, locale: 'fr', rows: [{ key: 'loc.a.two', base: 'Two {0}', comment: '' }], setups: [{ provider: 'openai' as const, model: 'a', temperature: 0 }, { provider: 'google' as const, model: 'b', temperature: 0 }], instructions: '' };

            answer = (rows, call) => call === 1 ? Promise.resolve(translated(rows)) : Promise.resolve([{ key: 'loc.a.two', value: 'Deux' }]);

            // act
            const started = engine.translationLab.start(request, 'json', 'en');

            await vi.waitFor(() => expect(engine.translationLab.get(started.id)?.isRunning).toBe(false));

            const result = engine.translationLab.get(started.id);

            // assert
            expect(result?.setups[0]).toMatchObject({ status: 'done', issues: 0, results: [{ key: 'loc.a.two', value: 'Two {0} [fr]', note: null }] });
            expect(result?.setups[1].issues).toBeGreaterThan(0);
            expect(pendingChangeSets()).toEqual([]);
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
        });

        it('shows a failing setup in its own column', async () => {
            // arrange
            states = { google: 'no-key' };

            // act
            const started = engine.translationLab.start({ projectId, locale: 'fr', rows: [{ key: 'k', base: 'V', comment: '' }], setups: [{ provider: 'openai', model: 'a', temperature: 0 }, { provider: 'google', model: 'b', temperature: 0 }], instructions: '' }, 'json', 'en');

            await vi.waitFor(() => expect(engine.translationLab.get(started.id)?.isRunning).toBe(false));

            // assert
            expect(engine.translationLab.get(started.id)?.setups.map((setup) => setup.status)).toEqual(['done', 'failed']);
        });
    });

    describe('Run on all projects', () => {
        const ready = (id: string): never => ({ id, name: id, kind: 'key', state: 'ready', description: '' }) as never;

        it('translates what a project still misses, with a provider that is ready and what the project configured', async () => {
            // arrange
            vi.spyOn(engine.generation, 'providers').mockResolvedValue([ready('openai')]);

            // act
            const setup = await engine.generation.configuredInput(projectId);

            // assert
            expect(setup).toMatchObject({ locales: ['fr'], scope: 'missing', namespace: null, keys: null, provider: 'openai', reviewBeforeWriting: true });
        });

        it('says so when no provider is ready', async () => {
            // arrange
            vi.spyOn(engine.generation, 'providers').mockResolvedValue([]);

            // act
            const result = await engine.commands.runConfigured(projectId, 'generate', { runId: 'run-none', dryRun: true });

            // assert
            expect(result).toMatchObject({ state: 'failed', failure: 'No AI provider is set up. Open Settings: AI.' });
            expect(calls).toEqual([]);
        });

        it('hands what it translated to the batch and writes nothing itself', async () => {
            // arrange
            vi.spyOn(engine.generation, 'providers').mockResolvedValue([ready('openai')]);

            const collected = new Array<string>();

            // act
            const result = await engine.commands.runConfigured(projectId, 'generate', {
                runId: 'run-batch',
                dryRun: false,
                collectChanges: (changeSet, writeMode) => collected.push(`${writeMode}:${changeSet.files.length}`)
            });

            // assert
            expect(result.state).toBe('succeeded');
            expect(collected).toEqual(['review:1']);
            expect(pendingChangeSets()).toEqual([]);
            expect(existsSync(join(repository, 'src/i18n/lang.fr.json'))).toBe(false);
        });
    });
});
