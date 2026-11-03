// #region Imports

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { buildSync } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import { WortlautEngine } from '../WortlautEngine';
import { ChangeSetBuilder } from './ChangeSetBuilder';
import { ChangeSetJournal } from './ChangeSetJournal';

// #endregion

/**
 * The folder of the bundled process that dies. Bundling it once keeps the spec quick.
 */
let bundleFolder: string;
let crashingApply: string;

beforeAll(() => {
    bundleFolder = mkdtempSync(join(tmpdir(), 'wortlaut-crash-bundle-'));
    crashingApply = join(bundleFolder, 'CrashingApply.cjs');
    buildSync({
        entryPoints: [resolve(__dirname, 'testing/CrashingApply.ts')],
        outfile: crashingApply,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node24',
        logLevel: 'silent'
    });
});

afterAll(() => {
    rmSync(bundleFolder, { recursive: true, force: true });
});

describe('the engine', () => {
    it('notes every apply in the journal of its profile, and leaves none behind', async () => {
        // arrange
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-crash-wiring-')));
        const commit = vi.spyOn(ChangeSetJournal.prototype, 'commit');

        try {
            const file = join(root, 'lang.en.json');

            writeFileSync(file, JSON.stringify({ b: 'B', a: 'A' }));

            const engine = new WortlautEngine({ surface: 'cli', logger: createLogger(), profileRoot: join(root, 'profile'), home: root });

            // act
            await engine.sort({ cwd: root, options: { resourceRoot: [root], type: ResourceMode.Json, order: 'asc' } });

            // assert
            expect(commit).toHaveBeenCalledTimes(1);
            expect(commit.mock.calls[0][1][0]).toMatchObject({ target: file, previous: Buffer.from(JSON.stringify({ b: 'B', a: 'A' })).toString('base64') });
            expect(readdirSync(join(root, 'profile', 'journal'))).toEqual([]);
        } finally {
            commit.mockRestore();
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('a process that dies between two renames', () => {
    let root: string;
    let profile: string;
    let first: string;
    let second: string;
    let created: string;

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-crash-')));
        profile = join(root, 'profile');
        first = join(root, 'repo', 'lang.de.json');
        second = join(root, 'repo', 'lang.en.json');
        created = join(root, 'repo', 'lang.fr.json');
        mkdirSync(join(root, 'repo'));
        writeFileSync(first, 'old first');
        writeFileSync(second, 'old second');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    function createChangeSet(id = 'set-1'): ChangeSet {
        const builder = new ChangeSetBuilder(id, join(root, 'repo'), new Date(), { command: 'sort', surface: 'cli', runId: 'run-1', detail: null });

        builder.propose(first, 'new first');
        builder.propose(second, 'new second');
        builder.propose(created, 'new third');

        return builder.build(false);
    }

    /**
     * Runs the real process and returns how it ended.
     */
    function crash(changeSet: ChangeSet, dieAfter = 0): { signal: NodeJS.Signals | null } {
        const file = join(root, 'set.json');

        writeFileSync(file, JSON.stringify(changeSet));

        const result = spawnSync(process.execPath, [crashingApply, join(profile, 'journal'), file, String(dieAfter)], { encoding: 'utf8' });

        return { signal: result.signal };
    }

    function start(logger = createLogger()): WortlautEngine {
        return new WortlautEngine({ surface: 'cli', logger, profileRoot: profile, home: root });
    }

    function stagedFiles(): Array<string> {
        return readdirSync(join(root, 'repo')).filter((name) => name.endsWith('.wortlaut-staged'));
    }

    it('leaves a half-written change set behind, which is what the journal is for', () => {
        // act
        const { signal } = crash(createChangeSet());

        // assert
        expect(signal).toBe(process.platform === 'win32' ? null : 'SIGKILL');
        expect(readFileSync(first, 'utf8')).toBe('new first');
        expect(readFileSync(second, 'utf8')).toBe('old second');
        expect(existsSync(created)).toBe(false);
        expect(readdirSync(join(profile, 'journal'))).toHaveLength(1);
    });

    it('finishes the change set on the next start', () => {
        // arrange
        crash(createChangeSet());
        const logger = createLogger();

        // act
        const engine = start(logger);

        // assert
        expect(engine.recovered.map((entry) => entry.outcome)).toEqual(['finished']);
        expect(readFileSync(first, 'utf8')).toBe('new first');
        expect(readFileSync(second, 'utf8')).toBe('new second');
        expect(readFileSync(created, 'utf8')).toBe('new third');
        expect(stagedFiles()).toEqual([]);
        expect(readdirSync(join(profile, 'journal'))).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Wortlaut finished it'));
    });

    it('takes a finished change set out of the review list, and records what happened', async () => {
        // arrange
        const before = start();
        const pending = before.listChangeSets().length;
        const changeSet = createChangeSet('set-pending');
        const list = (before as unknown as { _reviewList: { add(set: ChangeSet): ChangeSet } })._reviewList;

        list.add(changeSet);
        crash(changeSet);

        // act
        const engine = start();

        // assert
        expect(pending).toBe(0);
        expect(engine.listChangeSets()).toEqual([]);

        const record = engine.runs.list().find((run) => run.command === 'changes.recover');

        expect(record?.state).toBe('succeeded');
        expect(record?.changeSet?.state).toBe('applied');
        expect(record?.log[0].message).toContain('finished it');
        await expect(engine.applyChangeSet('set-pending', join(root, 'repo'))).rejects.toThrow(/no change set/);
    });

    it('restores the files when a staged file is gone, and the set stays in the review list ready to apply', async () => {
        // arrange
        const before = start();
        const changeSet = createChangeSet('set-lost');

        (before as unknown as { _reviewList: { add(set: ChangeSet): ChangeSet } })._reviewList.add(changeSet);
        crash(changeSet);
        rmSync(join(root, 'repo', '.lang.en.json.wortlaut-staged'));

        // act
        const engine = start();

        // assert
        expect(engine.recovered.map((entry) => entry.outcome)).toEqual(['restored']);
        expect(readFileSync(first, 'utf8')).toBe('old first');
        expect(readFileSync(second, 'utf8')).toBe('old second');
        expect(existsSync(created)).toBe(false);
        expect(stagedFiles()).toEqual([]);
        expect(engine.listChangeSets().map((set) => set.id)).toEqual(['set-lost']);

        await engine.applyChangeSet('set-lost', join(root, 'repo'));

        expect(readFileSync(second, 'utf8')).toBe('new second');
        expect(readFileSync(created, 'utf8')).toBe('new third');
    });

    it('leaves a file alone that somebody changed since, and names it', () => {
        // arrange
        crash(createChangeSet());
        writeFileSync(second, 'edited after the crash');

        // act
        const engine = start();

        // assert
        const [recovered] = engine.recovered;

        expect(recovered.outcome).toBe('restored');
        expect(recovered.conflicts).toEqual(['lang.en.json']);
        expect(recovered.message).toContain('lang.en.json');
        expect(readFileSync(second, 'utf8')).toBe('edited after the crash');
        expect(readFileSync(first, 'utf8')).toBe('old first');
        expect(existsSync(created)).toBe(false);
    });

    it('does not touch the journal of a process that is still alive', () => {
        // arrange
        crash(createChangeSet());
        const journal = join(profile, 'journal', 'set-1.json');
        const entry = JSON.parse(readFileSync(journal, 'utf8')) as { pid: number };

        // this test's parent is alive, and it is not this process
        entry.pid = process.ppid;
        writeFileSync(journal, JSON.stringify(entry));

        // act
        const engine = start();

        // assert
        expect(engine.recovered).toEqual([]);
        expect(readFileSync(second, 'utf8')).toBe('old second');
        expect(existsSync(journal)).toBe(true);
    });

    it('does not follow a journal that names a staged file elsewhere', () => {
        // arrange
        crash(createChangeSet());
        const journal = join(profile, 'journal', 'set-1.json');
        const outside = join(root, 'outside.txt');
        const entry = JSON.parse(readFileSync(journal, 'utf8')) as { files: Array<{ staged: string }> };

        writeFileSync(outside, 'new second');
        entry.files[1].staged = outside;
        writeFileSync(journal, JSON.stringify(entry));

        // act
        const engine = start();

        // assert
        expect(engine.recovered[0].outcome).toBe('failed');
        expect(readFileSync(outside, 'utf8')).toBe('new second');
        expect(readFileSync(second, 'utf8')).toBe('old second');
    });

    it('recovers once when the same process would start twice', () => {
        // arrange
        crash(createChangeSet());
        start();

        // act
        const again = start();

        // assert
        expect(again.recovered).toEqual([]);
        expect(again.runs.list().filter((run) => run.command === 'changes.recover')).toHaveLength(1);
    });
});

/**
 * @private
 */
function createLogger(): { log: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } {
    return { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}
