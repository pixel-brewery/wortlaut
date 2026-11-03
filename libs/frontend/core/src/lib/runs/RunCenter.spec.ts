// #region Imports

import { TestBed } from '@angular/core/testing';
import type { ActiveRun, IpcEvent } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from '../ipc/DesktopApi';
import { CommandRun } from './CommandRun';
import { RunCenter } from './RunCenter';

// #endregion

const RUN: ActiveRun = { id: 'r1', command: 'sort', projectId: 'p1', projectName: 'shop', title: 'sort', startedAt: new Date().toISOString(), dryRun: true, phase: 'Starting', completed: 0, total: 0, detail: null, batch: null, log: [] };

function setUp(active: Array<ActiveRun> = []) {
    let listener: (event: IpcEvent) => void = () => undefined;
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'run.active':
                return Promise.resolve(active);
            case 'run.start':
                return Promise.resolve(RUN);
            case 'run.result':
                return Promise.resolve({ runId: 'r1', command: 'sort', projectId: 'p1', state: 'succeeded', dryRun: true, failure: null, outcome: null, output: { command: 'sort', rows: [] } });
            case 'run.latest':
                return Promise.resolve(null);
            case 'shell.state':
                return Promise.resolve({ workspace: null, project: null, provider: null, dryRun: true, pendingChanges: 2 });
            default:
                return Promise.resolve({});
        }
    });

    TestBed.configureTestingModule({
        providers: [{ provide: DesktopApi, useValue: { request, onEvent: (handler: (event: IpcEvent) => void) => {
            listener = handler;

            return () => undefined;
        } } }]
    });

    return { center: TestBed.inject(RunCenter), api: TestBed.inject(DesktopApi), request, emit: (event: IpcEvent) => listener(event) };
}

describe('RunCenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('counts a run of another process as a change of the history', async () => {
        // arrange
        const { center, emit } = setUp();

        await center.connect();

        const before = center.finished();

        // act
        emit({ type: 'runs.updated' });

        // assert
        expect(center.finished()).toBe(before + 1);
    });

    it('refreshes the count of Review when another process changes the review list', async () => {
        // arrange
        const { center, emit, request } = setUp();

        await center.connect();

        // act
        emit({ type: 'changes.updated' });

        // assert
        expect(center.changes()).toBe(1);
        expect(request).toHaveBeenCalledWith('shell.state', {});
    });

    it('finds what is going on after a reload of the renderer', async () => {
        // arrange
        const { center } = setUp([RUN]);

        // act
        await center.connect();

        // assert
        expect(center.active()).toEqual([RUN]);
        expect(center.activeFor('p1', 'sort')?.id).toBe('r1');
        expect(center.isBusy()).toBe(true);
    });

    it('follows progress and log lines until the run ends', async () => {
        // arrange
        const { center, emit } = setUp([RUN]);

        await center.connect();

        const ended = center.whenFinished('r1');

        // act
        emit({ type: 'run.progress', runId: 'r1', phase: 'Sorting', completed: 1, total: 2, detail: 'a.json' });
        emit({ type: 'run.log', runId: 'r1', lines: ['Line'] });

        // assert
        expect(center.active()[0]).toMatchObject({ phase: 'Sorting', completed: 1, total: 2, detail: 'a.json', log: ['Line'] });

        // act
        emit({ type: 'run.finished', runId: 'r1', command: 'sort', projectId: 'p1', state: 'succeeded', failure: null });
        await ended;

        // assert
        expect(center.active()).toEqual([]);
        expect(center.finished()).toBe(1);
    });

    it('takes note of a change to the review list', async () => {
        // arrange
        const { center, emit, request } = setUp();

        await center.connect();

        // act
        emit({ type: 'changes.updated' });

        // assert
        expect(center.changes()).toBe(1);
        expect(request).toHaveBeenCalledWith('shell.state', {});
    });

    it('does not wait for a run that has ended', async () => {
        // arrange
        const { center } = setUp();

        // act & assert
        await expect(center.whenFinished('gone')).resolves.toBeUndefined();
    });
});

describe('CommandRun', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('follows a run from its start to its result', async () => {
        // arrange
        const { center, api, emit } = setUp();
        const run = new CommandRun(api, center, 'sort');

        // act
        const finished = run.start({ command: 'sort', projectId: 'p1', input: { order: 'asc' } });

        await vi.waitFor(() => {
            expect(run.isRunning()).toBe(true);
        });
        emit({ type: 'run.finished', runId: 'r1', command: 'sort', projectId: 'p1', state: 'succeeded', failure: null });
        await finished;

        // assert
        expect(run.isRunning()).toBe(false);
        expect(run.output()).toEqual({ command: 'sort', rows: [] });
    });

    it('finds a run that went on before a reload', async () => {
        // arrange
        const { center, api, emit } = setUp([RUN]);
        const run = new CommandRun(api, center, 'sort');

        // act
        const restored = run.restore('p1');

        await vi.waitFor(() => {
            expect(run.active()?.id).toBe('r1');
        });
        emit({ type: 'run.finished', runId: 'r1', command: 'sort', projectId: 'p1', state: 'succeeded', failure: null });
        await restored;

        // assert
        expect(run.result()?.state).toBe('succeeded');
    });

    it('says why a run could not start', async () => {
        // arrange
        const { center, api, request } = setUp();
        const run = new CommandRun(api, center, 'sort');

        request.mockImplementationOnce(() => Promise.resolve([]));
        request.mockImplementationOnce(() => Promise.reject(new Error('No project')));

        // act
        const result = await run.start({ command: 'sort', projectId: 'p1', input: { order: 'asc' } });

        // assert
        expect(result).toBeNull();
        expect(run.failure()).toBe('No project');
    });
});
