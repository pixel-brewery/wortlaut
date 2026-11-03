// #region Imports

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunRecord } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RunStore } from './RunStore';

// #endregion

describe('RunStore', () => {
    let root: string;
    let directory: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-runs-'));
        directory = join(root, 'runs');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('keeps the reads of an assistant apart, so they cannot push the commands of the user out of the history', () => {
        // arrange
        const store = new RunStore(directory, 2, 3);

        store.write(createRun('20261102T100000000Z-command'));

        // act
        for (let index = 0; index < 10; index++) {
            store.write(createRun(`20261102T10000${index}000Z-a-read`));
        }

        // assert
        expect(store.get('20261102T100000000Z-command')).not.toBeNull();
        expect(store.list().map((run) => run.id)).toEqual(['20261102T100009000Z-a-read', '20261102T100008000Z-a-read', '20261102T100007000Z-a-read', '20261102T100000000Z-command']);
    });

    it('notes who asked for a run, and leaves the rest of it alone', () => {
        // arrange
        const store = new RunStore(directory);
        const run = createRun('20261102T100000000Z-a');

        store.write(run);

        // act
        store.annotate(run.id, { client: 'codex', tool: 'detect', result: '2 files' });
        store.annotate('gone', { client: 'codex', tool: 'detect', result: '2 files' });

        // assert
        expect(store.get(run.id)).toEqual({ ...run, assistant: { client: 'codex', tool: 'detect', result: '2 files' } });
        expect(store.get('gone')).toBeNull();
    });

    it('gives a read an id with a bound of its own', () => {
        // act
        const id = RunStore.createReadId(new Date('2026-11-02T10:00:00.000Z'));

        // assert
        expect(id).toMatch(/^20261102T100000000Z-[0-9a-f]+-read$/);
    });

    it('stores a run and reads it back', () => {
        // arrange
        const store = new RunStore(directory);
        const run = createRun('20261102T100000000Z-a');

        // act
        store.write(run);

        // assert
        expect(store.get(run.id)).toEqual(run);
    });

    it('lists the newest run first', () => {
        // arrange
        const store = new RunStore(directory);
        store.write(createRun('20261102T100000000Z-a'));
        store.write(createRun('20261102T120000000Z-c'));
        store.write(createRun('20261102T110000000Z-b'));

        // act
        const ids = store.list().map((run) => run.id);

        // assert
        expect(ids).toEqual(['20261102T120000000Z-c', '20261102T110000000Z-b', '20261102T100000000Z-a']);
    });

    it('keeps only the newest runs beyond its bound', () => {
        // arrange
        const store = new RunStore(directory, 2);

        // act
        for (const id of ['20261102T100000000Z-a', '20261102T110000000Z-b', '20261102T120000000Z-c']) {
            store.write(createRun(id));
        }

        // assert
        expect(store.list().map((run) => run.id)).toEqual(['20261102T120000000Z-c', '20261102T110000000Z-b']);
        expect(readdirSync(directory)).toHaveLength(2);
    });

    it('keeps every run of several writers, one file per run', () => {
        // arrange
        const writers = [new RunStore(directory), new RunStore(directory), new RunStore(directory)];

        // act
        writers.forEach((store, index) => store.write(createRun(`20261102T100000000Z-${index}`)));

        // assert
        expect(new RunStore(directory).list()).toHaveLength(3);
    });

    it('refuses a run whose options hold a secret, and stores nothing', () => {
        // arrange
        const store = new RunStore(directory);

        // act & assert
        expect(() => store.write({ ...createRun('20261102T100000000Z-a'), options: { apiKey: 'sk-secret' } })).toThrow(/secret option/);
        expect(store.list()).toEqual([]);
    });

    it('skips a broken file and has nothing for an unknown or unsafe id', () => {
        // arrange
        const store = new RunStore(directory);
        store.write(createRun('20261102T100000000Z-a'));
        writeFileSync(join(directory, '20261102T110000000Z-b.json'), 'not json');

        // act & assert
        expect(store.list()).toHaveLength(1);
        expect(store.get('nope')).toBeNull();
        expect(store.get('../nope')).toBeNull();
    });

    it('is empty before the first run', () => {
        // act & assert
        expect(new RunStore(directory).list()).toEqual([]);
    });
});

function createRun(id: string): RunRecord {
    return {
        schemaVersion: 1,
        id,
        command: 'sort',
        surface: 'cli',
        state: 'succeeded',
        writeMode: 'apply',
        dryRun: false,
        cwd: '/project',
        startedAt: '2026-11-02T10:00:00.000Z',
        finishedAt: '2026-11-02T10:00:01.000Z',
        durationMs: 1000,
        options: { order: 'asc' },
        log: [{ level: 'info', message: 'done' }],
        droppedLogEntries: 0,
        findings: [],
        changeSet: null,
        failure: null
    };
}
