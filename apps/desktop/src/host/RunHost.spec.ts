// #region Imports

import type { IpcEvent, RunResult, RunStartRequest } from '@pixel-brewery/wortlaut-contracts';
import type { IBatchChange, IBatchWrite, IRunHosting } from '@pixel-brewery/wortlaut-engine';
import { describe, expect, it, vi } from 'vitest';
import { RunHost, type IRunCommands } from './RunHost';

// #endregion

const REQUEST: RunStartRequest = { command: 'sort', projectId: 'p1', input: { order: 'asc' } };

/**
 * A command that goes on until the test says so, or until it is stopped.
 */
function createCommands() {
    const started = new Array<{ projectId: string; hosting: IRunHosting; finish: () => void }>();
    const run = (projectId: string, hosting: IRunHosting): Promise<RunResult> => new Promise((resolve) => {
        const result = (state: RunResult['state']): RunResult => ({ runId: hosting.runId ?? '', command: 'sort', projectId, state, dryRun: hosting.dryRun, failure: state === 'stopped' ? 'stopped' : null, outcome: state === 'succeeded' ? { state: 'pending', changeSetId: 'c1', runId: hosting.runId ?? '', files: [] } : null, output: state === 'succeeded' ? { command: 'sort', rows: [] } : null });

        started.push({ projectId, hosting, finish: () => resolve(result('succeeded')) });
        hosting.signal?.addEventListener('abort', () => resolve(result('stopped')));
    });
    const commands: IRunCommands = {
        run: (request, hosting) => run(request.projectId, hosting),
        runConfigured: (projectId, _command, hosting) => run(projectId, hosting),
        repeat: (_record, projectId, hosting) => run(projectId, hosting),
        writeBatch: () => []
    };

    return { commands, started };
}

function createHost() {
    const events = new Array<IpcEvent>();
    const { commands, started } = createCommands();
    const host = new RunHost({ commands, publish: (event) => events.push(event), projectName: (id) => `name of ${id}` });

    return { host, events, started };
}

const tick = (): Promise<void> => new Promise((resolve) => {
    setImmediate(resolve);
});

describe('RunHost', () => {
    it('keeps a run going without any renderer and says what is going on', async () => {
        // arrange
        const { host, events, started } = createHost();

        // act
        const run = host.start(REQUEST, true);

        await tick();

        // assert
        expect(host.active().map((active) => active.id)).toEqual([run.id]);
        expect(run).toMatchObject({ projectName: 'name of p1', dryRun: true, command: 'sort' });
        expect(events[0]).toMatchObject({ type: 'run.started' });

        // act
        started[0].finish();
        await tick();

        // assert
        expect(host.active()).toEqual([]);
        expect(host.result(run.id)).toMatchObject({ state: 'succeeded', dryRun: true });
        expect(host.latest('p1', 'sort')?.runId).toBe(run.id);
        expect(events.map((event) => event.type)).toEqual(['run.started', 'run.finished', 'changes.updated']);
    });

    it('reports progress at most at its pace, and every new phase and log line', async () => {
        // arrange
        const { host, events, started } = createHost();
        const run = host.start(REQUEST, false);

        await tick();

        // act
        const { listener } = started[0].hosting;

        listener?.progress?.({ runId: run.id, phase: 'Read', completed: 1, total: 9, detail: null });
        listener?.progress?.({ runId: run.id, phase: 'Read', completed: 2, total: 9, detail: null });
        listener?.progress?.({ runId: run.id, phase: 'Sort', completed: 3, total: 9, detail: 'a.json' });
        listener?.log?.({ level: 'info', message: 'Line' });

        // assert
        expect(events.filter((event) => event.type === 'run.progress').map((event) => event.type === 'run.progress' && event.phase)).toEqual(['Read', 'Sort']);
        expect(events.filter((event) => event.type === 'run.log')).toHaveLength(1);
        expect(host.active()[0]).toMatchObject({ phase: 'Sort', completed: 3, total: 9, detail: 'a.json', log: ['Line'] });
    });

    it('cancels a run, which ends as stopped', async () => {
        // arrange
        const { host, events } = createHost();
        const run = host.start(REQUEST, false);

        await tick();

        // act
        host.cancel(run.id);
        await tick();

        // assert
        expect(host.result(run.id)?.state).toBe('stopped');
        expect(events.at(-1)).toMatchObject({ type: 'run.finished', state: 'stopped' });
    });

    it('keeps the dry run it started with', async () => {
        // arrange
        const { host, started } = createHost();

        // act
        host.start(REQUEST, true);
        await tick();

        // assert
        expect(started[0].hosting.dryRun).toBe(true);
    });

    it('runs a batch a bounded number at a time, and the next one starts when one ends', async () => {
        // arrange
        const { host, started } = createHost();

        // act
        const runs = host.startAll('w1', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 'analyze', true);

        await tick();

        // assert
        expect(runs.map((run) => run.batch?.index)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(host.active()).toHaveLength(6);
        expect(started.map((run) => run.projectId)).toEqual(['p1', 'p2', 'p3', 'p4']);
        expect(host.batchOf('w1')?.concurrency).toBe(4);
        expect(host.batchOf('w1')?.rows.map((row) => row.state)).toEqual(['running', 'running', 'running', 'running', 'waiting', 'waiting']);

        // act
        started[1].finish();
        await tick();

        // assert
        expect(started.map((run) => run.projectId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
        expect(host.batchOf('w1')?.rows[1].state).toBe('succeeded');
    });

    it('translates one project at a time', async () => {
        // arrange
        const { host, started } = createHost();

        // act
        host.startAll('w1', ['p1', 'p2'], 'generate', true);
        await tick();

        // assert
        expect(started.map((run) => run.projectId)).toEqual(['p1']);
        expect(host.batchOf('w1')?.concurrency).toBe(1);
    });

    it('stops the whole batch when one is cancelled: what works stops, and what waits never starts', async () => {
        // arrange
        const { host, started } = createHost();
        const runs = host.startAll('w1', ['p1', 'p2', 'p3', 'p4', 'p5'], 'sort', true);

        await tick();

        // act
        host.cancel(runs[0].id);
        await tick();
        await tick();

        // assert
        expect(runs.map((run) => host.result(run.id)?.state)).toEqual(['stopped', 'stopped', 'stopped', 'stopped', 'stopped']);
        expect(started).toHaveLength(4);
        expect(host.active()).toEqual([]);
        expect(host.batchOf('w1')?.rows.map((row) => row.state)).toEqual(['stopped', 'stopped', 'stopped', 'stopped', 'stopped']);
    });

    it('lets the others go on when one project fails, with one result per project', async () => {
        // arrange
        const finish = new Array<() => void>();
        const commands: IRunCommands = {
            run: () => Promise.reject(new Error('unused')),
            repeat: () => Promise.reject(new Error('unused')),
            writeBatch: () => [],
            runConfigured: (projectId, _command, hosting) => projectId === 'p2'
                ? Promise.reject(new Error('The catalog of p2 cannot be read.'))
                : new Promise((resolve) => {
                    finish.push(() => {
                        resolve({ runId: hosting.runId as string, command: 'analyze', projectId, state: 'succeeded', dryRun: true, failure: null, outcome: null, output: { command: 'analyze', rules: [{ id: 'empty-values', passed: false, message: '', locales: [], total: 0, rows: [], severity: 'error', pack: null }] } });
                    });
                })
        };
        const host = new RunHost({ commands, publish: () => undefined, projectName: (id) => id });

        // act
        const runs = host.startAll('w1', ['p1', 'p2', 'p3'], 'analyze', true);

        await tick();
        await tick();
        finish.forEach((done) => {
            done();
        });
        await tick();

        // assert
        expect(runs.map((run) => host.result(run.id)?.state)).toEqual(['succeeded', 'failed', 'succeeded']);
        expect(host.batchOf('w1')?.rows).toMatchObject([
            { projectId: 'p1', state: 'succeeded', summary: '1 rule failing', failure: null },
            { projectId: 'p2', state: 'failed', failure: 'The catalog of p2 cannot be read.' },
            { projectId: 'p3', state: 'succeeded', summary: '1 rule failing', failure: null }
        ]);
    });

    it('refuses a second batch while one goes on, and keeps a batch for a view that reloads', async () => {
        // arrange
        const { host, started, events } = createHost();

        host.startAll('w1', ['p1'], 'sort', false);
        await tick();

        // act & assert
        expect(() => host.startAll('w1', ['p1'], 'sort', false)).toThrow('still going on');
        expect(events.some((event) => event.type === 'run.batchUpdated')).toBe(true);

        // act
        started[0].finish();
        await tick();

        // assert
        expect(host.batchOf('w1')?.rows[0].state).toBe('succeeded');
        expect(() => host.startAll('w1', ['p1'], 'sort', false)).not.toThrow();
    });

    it('writes once when every project has ended, and tells each one what became of its files', async () => {
        // arrange
        const events = new Array<IpcEvent>();
        const finish = new Array<() => void>();
        const writeBatch = vi.fn((changes: ReadonlyArray<IBatchChange>): Array<IBatchWrite> => changes.map(({ runId, changeSet }) => ({ runId, failure: null, outcome: { state: 'pending', changeSetId: 'merged', runId, files: changeSet.files.map((file) => file.displayPath) } })));
        const commands: IRunCommands = {
            run: () => Promise.reject(new Error('unused')),
            repeat: () => Promise.reject(new Error('unused')),
            writeBatch,
            runConfigured: (projectId, _command, hosting) => new Promise((resolve) => {
                finish.push(() => {
                    hosting.collectChanges?.({ files: [{ displayPath: `${projectId}.json` }] } as never, 'review');
                    resolve({ runId: hosting.runId as string, command: 'sort', projectId, state: 'succeeded', dryRun: true, failure: null, outcome: null, output: { command: 'sort', rows: [] } });
                });
            })
        };
        const host = new RunHost({ commands, publish: (event) => events.push(event), projectName: (id) => id });

        // act
        const runs = host.startAll('w1', ['p1', 'p2'], 'sort', true);

        await tick();
        finish[0]();
        await tick();

        // assert: nothing is written while a project of the batch goes on
        expect(writeBatch).not.toHaveBeenCalled();

        // act
        finish[1]();
        await tick();
        await tick();

        // assert
        expect(writeBatch).toHaveBeenCalledTimes(1);
        expect(writeBatch.mock.calls[0][0].map((change) => change.projectId)).toEqual(['p1', 'p2']);
        expect(host.result(runs[1].id)?.outcome).toMatchObject({ state: 'pending', changeSetId: 'merged', files: ['p2.json'] });
        expect(host.batchOf('w1')?.rows.map((row) => row.summary)).toEqual(['1 file waiting in Review', '1 file waiting in Review']);
        expect(events.some((event) => event.type === 'changes.updated')).toBe(true);
    });

    it('marks every project of a repository as failed when writing it fails', async () => {
        // arrange
        const commands: IRunCommands = {
            run: () => Promise.reject(new Error('unused')),
            repeat: () => Promise.reject(new Error('unused')),
            writeBatch: (changes) => changes.map(({ runId }) => ({ runId, outcome: null, failure: 'lang.en.json changed since the change set was built. Nothing was written.' })),
            runConfigured: (projectId, _command, hosting) => {
                hosting.collectChanges?.({ files: [] } as never, 'apply');

                return Promise.resolve({ runId: hosting.runId as string, command: 'sort', projectId, state: 'succeeded', dryRun: false, failure: null, outcome: null, output: { command: 'sort', rows: [] } });
            }
        };
        const host = new RunHost({ commands, publish: () => undefined, projectName: (id) => id });

        // act
        host.startAll('w1', ['p1'], 'sort', false);
        await tick();
        await tick();
        await tick();

        // assert
        expect(host.batchOf('w1')?.rows[0]).toMatchObject({ state: 'failed', failure: expect.stringContaining('lang.en.json changed') });
    });

    it('sends a line of a log to the renderer with its paths as display values', async () => {
        // arrange
        const events = new Array<IpcEvent>();
        const { commands, started } = createCommands();
        const host = new RunHost({ commands, publish: (event) => events.push(event), projectName: (id) => id, scrub: (text) => text.replace('/home-of-me', '~') });
        const run = host.start(REQUEST, false);

        await tick();

        // act
        started[0].hosting.listener?.log?.({ level: 'info', message: 'Resource: en (/home-of-me/app/lang.en.json)' });

        // assert
        expect(events).toContainEqual({ type: 'run.log', runId: run.id, lines: ['Resource: en (~/app/lang.en.json)'] });
    });

    it('hands every run what Settings: application says when it starts', async () => {
        // arrange
        const { commands, started } = createCommands();
        const host = new RunHost({ commands, publish: () => undefined, projectName: (id) => id, hosting: () => ({ cache: { folder: '.wortlaut/cache' }, verbose: true }) });

        // act
        host.start(REQUEST, false);
        await tick();

        // assert
        expect(started[0].hosting).toMatchObject({ cache: { folder: '.wortlaut/cache' }, verbose: true });
    });

    it('waits for what it stops when the app shuts down', async () => {
        // arrange
        const { host } = createHost();
        const run = host.start(REQUEST, false);

        await tick();

        // act
        await host.shutdown();

        // assert
        expect(host.active()).toEqual([]);
        expect(host.result(run.id)?.state).toBe('stopped');
    });
});
