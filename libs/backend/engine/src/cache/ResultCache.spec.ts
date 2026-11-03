// #region Imports

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import type { IAnalyzeOptions } from '../interfaces/ICommandOptions';
import { WortlautEngine } from '../WortlautEngine';
import { DEFAULT_CACHE_FOLDER, ResultCache } from './ResultCache';

// #endregion

const LOGGER = { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;

describe('ResultCache', () => {
    let root: string;
    let cwd: string;

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-cache-')));
        cwd = join(root, 'repo');
        mkdirSync(join(cwd, 'i18n'), { recursive: true });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe('the store', () => {
        it('finds a value only for exactly the same inputs', () => {
            // arrange
            const cache = new ResultCache(join(cwd, DEFAULT_CACHE_FOLDER), 'tool-1', true);

            cache.write('work', { a: 1, b: { c: 2 } }, 'value');

            // assert: the order of the fields does not matter, anything else does
            expect(cache.read('work', { b: { c: 2 }, a: 1 })).toBe('value');
            expect(cache.read('work', { a: 1, b: { c: 3 } })).toBeUndefined();
            expect(cache.read('other', { a: 1, b: { c: 2 } })).toBeUndefined();
        });

        it('treats another version of the tool as a miss', () => {
            // arrange
            new ResultCache(join(cwd, DEFAULT_CACHE_FOLDER), 'tool-1', true).write('work', { a: 1 }, 'value');

            // assert
            expect(new ResultCache(join(cwd, DEFAULT_CACHE_FOLDER), 'tool-2', true).read('work', { a: 1 })).toBeUndefined();
        });

        it('treats a damaged entry and an entry under the wrong name as a miss', () => {
            // arrange
            const folder = join(cwd, DEFAULT_CACHE_FOLDER);
            const cache = new ResultCache(folder, 'tool-1', true);

            cache.write('work', { a: 1 }, 'one');
            cache.write('work', { a: 2 }, 'two');

            const entries = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.name.endsWith('.json'))
                .map((entry) => join(entry.parentPath, entry.name));
            const [firstEntry, secondEntry] = entries;

            writeFileSync(secondEntry, readFileSync(firstEntry));
            writeFileSync(firstEntry, '{"key":');

            // assert
            expect(cache.read('work', { a: 1 })).toBeUndefined();
            expect(cache.read('work', { a: 2 })).toBeUndefined();
        });

        it('writes nothing when it may only read', () => {
            // arrange
            const cache = new ResultCache(join(cwd, DEFAULT_CACHE_FOLDER), 'tool-1', false);

            // act
            cache.write('work', { a: 1 }, 'value');

            // assert
            expect(existsSync(join(cwd, '.wortlaut'))).toBe(false);
        });

        it('ignores itself in Git', () => {
            // act
            new ResultCache(join(cwd, DEFAULT_CACHE_FOLDER), 'tool-1', true).write('work', { a: 1 }, 'value');

            // assert
            expect(readFileSync(join(cwd, DEFAULT_CACHE_FOLDER, '.gitignore'), 'utf8')).toBe('*\n');
        });

        it('opens no cache without a tool to vouch for it, and none through a link that leaves the working directory', () => {
            // arrange
            const outside = join(root, 'outside');

            mkdirSync(outside);
            symlinkSync(outside, join(cwd, '.wortlaut'));

            // assert
            expect(ResultCache.open(cwd, {}, undefined, true)).toBeNull();
            expect(ResultCache.open(cwd, undefined, 'tool-1', true)).toBeNull();
            expect(ResultCache.open(cwd, {}, 'tool-1', true)).toBeNull();
        });
    });

    describe('an analysis', () => {
        let de: string;
        let en: string;

        beforeEach(() => {
            en = join(cwd, 'i18n', 'lang.en.json');
            de = join(cwd, 'i18n', 'lang.de.json');
            writeFileSync(en, JSON.stringify({ 'a.title': 'Title', 'a.same': 'Same', 'a.value': 'Value' }));
            writeFileSync(de, JSON.stringify({ 'a.title': 'Titel', 'a.same': 'Same', 'a.value': 'Value' }));
        });

        function createEngine(tool = 'tool-1'): WortlautEngine {
            return new WortlautEngine({ surface: 'cli', logger: LOGGER, fileSystem: new FileSystem(), profileRoot: join(root, 'profile'), home: root, tool });
        }

        function options(change: Partial<IAnalyzeOptions> = {}): IAnalyzeOptions {
            return {
                root: '',
                preset: '',
                type: ResourceMode.Json,
                resourceKeyPrefix: '',
                resourceKeySuffix: '',
                resourceRoot: join(cwd, 'i18n'),
                rules: [],
                usedKeys: [],
                baseLocale: 'en',
                identicalKeys: [],
                identicalValues: [],
                ...change
            };
        }

        async function analyze(engine: WortlautEngine, change: Partial<IAnalyzeOptions> = {}, cache: { folder?: string } | null = {}, writeMode: 'apply' | 'dry-run' = 'apply'): Promise<{ report: unknown; findings: unknown; log: Array<string> }> {
            const outcome = await engine.analyze({ cwd, options: options(change), writeMode, ...cache ? { cache } : {} });
            const record = engine.runs.get(outcome.report.runId as string);

            return { report: outcome.report.data, findings: outcome.report.findings, log: record?.log.map((entry) => entry.message) ?? [] };
        }

        function reused(log: ReadonlyArray<string>): string {
            return log.find((line) => line.startsWith('Reused')) ?? '';
        }

        it('gives the same result from the cache as without it, with every rule reused', async () => {
            // arrange
            const engine = createEngine();
            const plain = await analyze(engine, {}, null);

            // act
            const cold = await analyze(engine);
            const warm = await analyze(engine);

            // assert
            expect(reused(cold.log)).toMatch(/^Reused 0 of /);
            expect(reused(warm.log)).toMatch(/^Reused (\d+) of \1 /);
            expect(warm.report).toEqual(plain.report);
            expect(warm.findings).toEqual(plain.findings);
        });

        it('sees a changed catalog at once, even with the same size and date', async () => {
            // arrange
            const engine = createEngine();
            const before = await analyze(engine);

            expect(JSON.stringify(before.findings)).not.toContain('Fehlt');

            // act: same length, so nothing but the content tells them apart
            writeFileSync(de, JSON.stringify({ 'a.title': 'Titel', 'a.same': 'Same', 'a.value': 'Valu!' }));

            const after = await analyze(engine);
            const fresh = await analyze(createEngine(), {}, null);

            // assert
            expect(after.report).toEqual(fresh.report);
            expect(after.report).not.toEqual(before.report);
        });

        it('reuses the rules of a catalog that did not change when another one changed', async () => {
            // arrange
            const engine = createEngine();

            await analyze(engine);

            // act
            writeFileSync(de, JSON.stringify({ 'a.title': 'Titel', 'a.same': 'Anders', 'a.value': 'Wert' }));

            const after = await analyze(engine);
            const [hits, total] = (/^Reused (\d+) of (\d+)/.exec(reused(after.log)) ?? []).slice(1).map(Number);

            // assert: what looks only at the English catalog stays, and everything that compares runs again
            expect(hits).toBeGreaterThan(0);
            expect(hits).toBeLessThan(total);
            expect(after.report).toEqual((await analyze(createEngine(), {}, null)).report);
        });

        it.each([
            ['the base locale', { baseLocale: 'de' }],
            ['the rules exceptions', { ruleExceptions: { 'missing-translations': ['a.same'] } }],
            ['the severities', { severities: { 'missing-translations': 'warning' as const } }],
            ['the identical keys', { identicalKeys: ['a.*'] }],
            ['the identical values', { identicalValues: ['Same'] }],
            ['the used keys', { usedKeys: ['a.title'], rules: ['unused-keys'], explicitRules: true }]
        ])('misses when %s change', async (_name, change) => {
            // arrange
            const engine = createEngine();

            await analyze(engine);

            // act
            const changed = await analyze(engine, change);
            const fresh = await analyze(createEngine(), change, null);

            // assert
            expect(changed.report).toEqual(fresh.report);
        });

        it('misses for another version of the tool', async () => {
            // arrange
            await analyze(createEngine('tool-1'));

            // act
            const other = await analyze(createEngine('tool-2'));

            // assert
            expect(reused(other.log)).toMatch(/^Reused 0 of /);
        });

        it('misses when the lock file pins other packs', async () => {
            // arrange
            const engine = createEngine();

            await analyze(engine);
            writeFileSync(join(cwd, 'wortlaut.lock.json'), JSON.stringify({ schemaVersion: 1, packs: {} }));
            writeFileSync(join(cwd, 'nx.json'), '{}');

            // act
            const changed = await analyze(engine);

            // assert: a lock file with no packs still leaves the same rules, so the result must match a run without a cache
            expect(changed.report).toEqual((await analyze(createEngine(), {}, null)).report);
        });

        it('reads the cache in a dry run and leaves no trace of one', async () => {
            // arrange
            const engine = createEngine();

            // act
            const dry = await analyze(engine, {}, {}, 'dry-run');

            // assert
            expect(reused(dry.log)).toMatch(/^Reused 0 of /);
            expect(existsSync(join(cwd, '.wortlaut'))).toBe(false);

            // arrange
            await analyze(engine);

            // act
            const warm = await analyze(engine, {}, {}, 'dry-run');

            // assert
            expect(reused(warm.log)).toMatch(/^Reused (\d+) of \1 /);
        });

        it('stays out of the way by default', async () => {
            // act
            const { log } = await analyze(createEngine(), {}, null);

            // assert
            expect(reused(log)).toBe('');
            expect(existsSync(join(cwd, '.wortlaut'))).toBe(false);
        });
    });

    describe('a scan', () => {
        it('finds what a changed source holds', async () => {
            // arrange
            const source = join(cwd, 'src', 'View.tsx');
            const engine = new WortlautEngine({ surface: 'cli', logger: LOGGER, fileSystem: new FileSystem(), profileRoot: join(root, 'profile'), home: root, tool: 'tool-1' });
            const detect = async (): Promise<Array<string>> => {
                const outcome = await engine.detect({ cwd, cache: {}, options: { root: join(cwd, 'src'), preset: 'react' as never, type: ResourceMode.Json, resourceKeyPrefix: '', resourceKeySuffix: '' } });

                return outcome.result.flatMap((file) => file.parsings.map((parsing) => parsing.match.value ?? ''));
            };

            mkdirSync(join(cwd, 'src'));
            writeFileSync(source, 'export const View = () => <b>{t("First text")}</b>;');

            // act
            const cold = await detect();
            const warm = await detect();

            writeFileSync(source, 'export const View = () => <b>{t("Other text")}</b>;');

            const changed = await detect();

            // assert
            expect(cold).toEqual(['First text']);
            expect(warm).toEqual(cold);
            expect(changed).toEqual(['Other text']);
        });
    });
});
