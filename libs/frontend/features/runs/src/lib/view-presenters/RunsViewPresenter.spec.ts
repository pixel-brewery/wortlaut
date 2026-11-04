// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { ActiveRun, IpcEvent, RunDetail, RunSummary } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeChange, noChangesReason, runModeTag, runStateBadge, RunsViewPresenter } from './RunsViewPresenter';

// #endregion

const RUN: RunSummary = { id: 'r1', title: 'sort', command: 'sort', state: 'succeeded', surface: 'cli', client: null, dryRun: true, forReview: false, canRepeat: true, startedAt: new Date(Date.now() - 120_000).toISOString(), detail: 'Ascending', failedRules: 0 };
const DETAIL: RunDetail = { ...RUN, durationMs: 1800, equivalentCommand: 'npx wortlaut sort --dry-run', equivalentCommandShown: 'npx wortlaut sort --dry-run', log: 'Sorting', droppedLogEntries: 0, changes: [{ file: 'lang.de.json', action: 'update', state: 'proposed' }], configuration: '{ "cwd": "~/shop" }', failure: null };

function setUp(options: { runs?: Array<RunSummary>; param?: string | null; detail?: RunDetail; active?: Array<ActiveRun> } = {}) {
    let listener: (event: IpcEvent) => void = () => undefined;
    const navigate = vi.fn(() => Promise.resolve(true));
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'run.list':
                return Promise.resolve(options.runs ?? [RUN, { ...RUN, id: 'r2' }]);
            case 'run.get':
                return Promise.resolve(options.detail ?? DETAIL);
            case 'clipboard.writeText':
            case 'run.cancel':
                return Promise.resolve({});
            case 'run.active':
                return Promise.resolve(options.active ?? []);
            case 'run.repeat':
                return Promise.resolve({ id: 'r9', command: 'sort', projectId: 'p1', projectName: 'shop', title: 'sort', startedAt: new Date().toISOString(), dryRun: true, phase: 'Starting', completed: 0, total: 0, detail: null, batch: null, log: [] });
            default:
                return Promise.resolve({ workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
        }
    });

    TestBed.configureTestingModule({
        providers: [
            RunsViewPresenter,
            { provide: DesktopApi, useValue: { request, onEvent: (handler: (event: IpcEvent) => void) => {
                listener = handler;

                return () => undefined;
            } } },
            { provide: Router, useValue: { navigate } },
            { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['runId', options.param ?? null]]) } } }
        ]
    });

    return { presenter: TestBed.inject(RunsViewPresenter), session: TestBed.inject(ShellSession), request, navigate, emit: (event: IpcEvent) => listener(event) };
}

describe('runModeTag', () => {
    it('tells a dry run from a run that left its change set for review', () => {
        expect(runModeTag({ dryRun: true, forReview: false })).toBe('dry run');
        expect(runModeTag({ dryRun: false, forReview: true })).toBe('for review');
        expect(runModeTag({ dryRun: false, forReview: false })).toBeNull();
    });
});

describe('runStateBadge', () => {
    it('tells a failed analysis from a failed run', () => {
        expect(runStateBadge({ state: 'succeeded', failedRules: 0 })).toEqual({ label: 'Done', variant: 'success' });
        expect(runStateBadge({ state: 'succeeded', failedRules: 4 })).toEqual({ label: '4 rules failed', variant: 'warning' });
        expect(runStateBadge({ state: 'succeeded', failedRules: 1 })).toEqual({ label: '1 rule failed', variant: 'warning' });
        expect(runStateBadge({ state: 'failed', failedRules: 0 })).toEqual({ label: 'Failed', variant: 'danger' });
        expect(runStateBadge({ state: 'stopped', failedRules: 0 })).toEqual({ label: 'Stopped', variant: 'danger' });
    });
});

describe('describeChange', () => {
    it('says what happened to a file', () => {
        expect(describeChange({ file: 'a', action: 'update', state: 'applied' })).toBe('Written');
        expect(describeChange({ file: 'a', action: 'create', state: 'applied' })).toBe('Created');
        expect(describeChange({ file: 'a', action: 'update', state: 'pending' })).toBe('Waiting for review');
        expect(describeChange({ file: 'a', action: 'update', state: 'proposed' })).toBe('Would be written');
        expect(describeChange({ file: 'a', action: 'update', state: 'discarded' })).toBe('Discarded');
    });
});

describe('noChangesReason', () => {
    it('gives the true reason', () => {
        expect(noChangesReason({ command: 'analyze', dryRun: true, state: 'succeeded' })).toBe('analyze never changes files.');
        expect(noChangesReason({ command: 'sort', dryRun: true, state: 'succeeded' })).toBe('A dry run writes nothing.');
        expect(noChangesReason({ command: 'sort', dryRun: false, state: 'succeeded' })).toBe('Nothing needed to change.');
        expect(noChangesReason({ command: 'generate', dryRun: false, state: 'failed' })).toBe('The run ended before anything could be written.');
    });
});

describe('RunsViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('shows a bounded history and keeps its oldest retained entry reachable', async () => {
        // arrange
        const runs = Array.from({ length: 150 }, (_, index) => ({ ...RUN, id: `r${index}` }));
        const { presenter } = setUp({ runs });
        await presenter.load();
        expect(presenter.rows()).toHaveLength(100);

        // act
        presenter.showMoreRuns();

        // assert
        expect(presenter.rows().at(-1)?.id).toBe('r149');
        expect(presenter.hasMoreRuns()).toBe(false);
    });

    it('loads more changed files without changing the source log or command', async () => {
        // arrange
        const changes = Array.from({ length: 205 }, (_, index) => ({ ...DETAIL.changes[0], file: `catalog-${index}.json` }));
        const { presenter } = setUp({ detail: { ...DETAIL, changes } });
        await presenter.load();
        expect(presenter.changes()).toHaveLength(100);

        // act
        presenter.showMoreChanges();
        presenter.showMoreChanges();

        // assert
        expect(presenter.changes().at(-1)?.file).toBe('catalog-204.json');
        expect(presenter.hasMoreChanges()).toBe(false);
        expect(presenter.code()).toBe(DETAIL.log);
        expect(presenter.detail.value()?.equivalentCommand).toBe(DETAIL.equivalentCommand);
    });

    it('resets the changed-file window when selecting another run', async () => {
        // arrange
        const changes = Array.from({ length: 205 }, (_, index) => ({ ...DETAIL.changes[0], file: `catalog-${index}.json` }));
        const { presenter } = setUp({ detail: { ...DETAIL, changes } });
        await presenter.load();
        presenter.showMoreChanges();

        // act
        await presenter.select('r2');

        // assert
        expect(presenter.changes()).toHaveLength(100);
        expect(presenter.hasMoreChanges()).toBe(true);
    });

    it('lists the runs of every project without an open project', async () => {
        const { presenter, request } = setUp();

        await presenter.load();

        expect(request).toHaveBeenCalledWith('run.list', { projectId: null, limit: null });
        expect(presenter.runs.value()).toHaveLength(2);
    });

    it('names the assistant behind a run through MCP', async () => {
        const { presenter, session } = setUp();

        await session.refresh();

        expect(presenter.whenOf({ ...RUN, surface: 'mcp', client: 'Claude Code', dryRun: false })).toBe('Claude Code via MCP · 2 min ago');
    });

    it('reads the history again when another process recorded a run', async () => {
        const { presenter, session, request, emit } = setUp();

        await session.refresh();
        await presenter.load();
        request.mockClear();

        emit({ type: 'runs.updated' });
        TestBed.tick();

        await vi.waitFor(() => expect(request).toHaveBeenCalledWith('run.list', { projectId: 'p1', limit: null }));
    });

    it('selects the newest run when none is named', async () => {
        const { presenter, session, request } = setUp();

        await session.refresh();
        await presenter.load();

        expect(request).toHaveBeenCalledWith('run.list', { projectId: 'p1', limit: null });
        expect(presenter.selectedId()).toBe('r1');
        expect(request).toHaveBeenCalledWith('run.get', { runId: 'r1' });
    });

    it('opens the run the route names', async () => {
        const { presenter, session, request } = setUp({ param: 'r2' });

        await session.refresh();
        await presenter.load();

        expect(presenter.selectedId()).toBe('r2');
        expect(request).toHaveBeenCalledWith('run.get', { runId: 'r2' });
    });

    it('has no details without runs', async () => {
        const { presenter, session, request } = setUp({ runs: [] });

        await session.refresh();
        await presenter.load();

        expect(presenter.detail.value()).toBeNull();
        expect(request).not.toHaveBeenCalledWith('run.get', expect.anything());
    });

    it('writes the line of the details', async () => {
        const { presenter, session } = setUp();

        await session.refresh();
        await presenter.load();

        expect(presenter.detailLine()).toBe('CLI · dry run · 2 min ago · 1.8 s · Ascending');
    });

    it('shows the log, the configuration and the changes by tab', async () => {
        const { presenter, session } = setUp({ detail: { ...DETAIL, droppedLogEntries: 3, failure: 'It failed.' } });

        await session.refresh();
        await presenter.load();

        expect(presenter.code()).toBe('3 earlier log entries were dropped.\nSorting\nIt failed.');

        presenter.openTab('configuration');
        expect(presenter.code()).toBe('{ "cwd": "~/shop" }');

        presenter.openTab('changes');
        expect(presenter.changes()).toEqual([{ file: 'lang.de.json', text: 'Would be written' }]);
    });

    it('says when a run logged nothing', async () => {
        const { presenter, session } = setUp({ detail: { ...DETAIL, log: '' } });

        await session.refresh();
        await presenter.load();

        expect(presenter.code()).toBe('This run logged nothing.');
    });

    it('selects another run and keeps the route with it', async () => {
        const { presenter, session, navigate, request } = setUp();

        await session.refresh();
        await presenter.load();
        await presenter.select('r2');

        expect(navigate).toHaveBeenCalledWith(['/runs', 'r2']);
        expect(request).toHaveBeenLastCalledWith('run.get', { runId: 'r2' });
    });

    it('copies the equivalent command and says so for a moment', async () => {
        vi.useFakeTimers();

        const { presenter, session, request } = setUp();

        await session.refresh();
        await presenter.load();
        await presenter.copyCommand();

        expect(request).toHaveBeenCalledWith('clipboard.writeText', { text: 'npx wortlaut sort --dry-run' });
        expect(presenter.copied()).toBe(true);

        vi.advanceTimersByTime(2000);
        expect(presenter.copied()).toBe(false);

        vi.useRealTimers();
    });

    it('starts a stored run again and cancels one that is going on', async () => {
        // arrange
        const { presenter, session, request } = setUp({ active: [{ id: 'live', command: 'sort', projectId: 'p1', projectName: 'shop', title: 'sort', startedAt: new Date().toISOString(), dryRun: true, phase: 'Sorting', completed: 1, total: 2, detail: null, batch: null, log: [] }] });

        await session.refresh();
        await presenter.load();

        // assert
        expect(presenter.active().map((run) => run.id)).toEqual(['live']);

        // act
        await presenter.runAgain();
        await presenter.cancel('live');

        // assert
        expect(request).toHaveBeenCalledWith('run.repeat', { runId: 'r1' });
        expect(request).toHaveBeenCalledWith('run.cancel', { runId: 'live' });
    });
});
