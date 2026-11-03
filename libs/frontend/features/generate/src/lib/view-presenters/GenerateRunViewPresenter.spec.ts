// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { GenerateRun, IpcEvent } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeStatus, GenerateRunViewPresenter } from './GenerateRunViewPresenter';

// #endregion

const RUN: GenerateRun = {
    runId: 'run1',
    projectId: 'p1',
    status: 'done',
    failure: null,
    dryRun: true,
    provider: { id: 'claude-code', name: 'Claude Code', kind: 'local' },
    baseLocale: 'en',
    input: { locales: ['fr', 'de'], scope: 'all', namespace: null, keys: null, limit: null, provider: 'claude-code', model: '', temperature: 0.7, chunkSize: 10, instructions: '', reviewBeforeWriting: true, protectPlaceholders: true },
    startedAt: '2026-11-02T10:00:00.000Z',
    elapsedMs: 2000,
    locales: [
        { locale: 'fr', status: 'done', target: 'i18n/lang.fr.json', doneKeys: 2, totalKeys: 2, doneChunks: 1, totalChunks: 1, chunks: ['done'], estimatedTokens: 1500, needsAttention: 1, writable: 1 },
        { locale: 'de', status: 'waiting', target: 'i18n/lang.de.json', doneKeys: 0, totalKeys: 2, doneChunks: 0, totalChunks: 1, chunks: ['waiting'], estimatedTokens: 0, needsAttention: 0, writable: 0 }
    ],
    locale: 'fr',
    rows: [
        { key: 'loc.a', base: 'One', value: 'Un', note: null, severity: 'none', accepted: true, canAccept: true, written: false },
        { key: 'loc.b', base: 'Two {0}', value: 'Deux', note: 'Placeholder {0} is missing', severity: 'danger', accepted: false, canAccept: false, written: false }
    ],
    checks: [{ id: 'placeholders', title: 'Placeholders', text: '1 of 2', severity: 'danger' }, { id: 'keys', title: 'Keys', text: 'All keys', severity: 'success' }],
    log: ['Translating from en to fr', 'Chunk 1 of 1 completed'],
    changeSetId: 'c1',
    partial: false
};

/**
 * @private
 */
function setUp(run: GenerateRun = RUN, dryRun = true) {
    let current = run;
    const listeners = new Array<(event: IpcEvent) => void>();
    const navigate = vi.fn(() => Promise.resolve(true));
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: null, project: { id: 'p1', name: 'shop' }, provider: null, dryRun, pendingChanges: 0 });
            case 'run.active':
                return Promise.resolve([]);
            case 'generate.get':
                return Promise.resolve(current);
            case 'generate.setRow':
                return Promise.resolve(current.rows[0]);
            case 'generate.write':
                return Promise.resolve({ state: 'applied', changeSetId: 'c2', runId: 'r2', files: ['i18n/lang.fr.json'] });
            case 'generate.again':
                return Promise.resolve({ id: 'run2', command: 'generate', projectId: 'p1', projectName: 'shop', title: 'generate', startedAt: new Date().toISOString(), dryRun, phase: 'Starting', completed: 0, total: 0, detail: null, batch: null, log: [] });
            default:
                return Promise.resolve({});
        }
    });

    TestBed.configureTestingModule({
        providers: [
            GenerateRunViewPresenter,
            { provide: DesktopApi, useValue: { request, onEvent: (handler: (event: IpcEvent) => void) => {
                listeners.push(handler);

                return () => undefined;
            } } },
            { provide: Router, useValue: { navigate } },
            { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ runId: 'run1' }) } } }
        ]
    });

    return {
        presenter: TestBed.inject(GenerateRunViewPresenter),
        session: TestBed.inject(ShellSession),
        request,
        navigate,
        change: (next: GenerateRun) => {
            current = next;
        },
        emit: (event: IpcEvent) => {
            for (const listener of listeners) {
                listener(event);
            }
        }
    };
}

/**
 * @private
 */
async function loaded(run: GenerateRun = RUN, dryRun = true) {
    const context = setUp(run, dryRun);

    await context.session.refresh();
    await context.presenter.load();

    return context;
}

describe('describeStatus', () => {
    it('names every state as the board does, and paused beside them', () => {
        expect(describeStatus({ status: 'running', failure: null })).toEqual({ label: 'Translating', variant: 'info' });
        expect(describeStatus({ status: 'paused', failure: null }).label).toBe('Paused');
        expect(describeStatus({ status: 'failed', failure: { locale: 'fr', chunk: 32, message: 'x', canResume: true } })).toEqual({ label: 'Stopped at chunk 32', variant: 'danger' });
        expect(describeStatus({ status: 'done', failure: null })).toEqual({ label: 'Ready for review', variant: 'success' });
    });
});

describe('GenerateRunViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('shows the run the route names', async () => {
        // act
        const { presenter, request } = await loaded();

        // assert
        expect(request).toHaveBeenCalledWith('generate.get', { runId: 'run1', locale: null });
        expect(presenter.title()).toBe('English to French');
        expect(presenter.subtitle()).toBe('Claude Code · local login · 10 keys per chunk · target ');
        expect(presenter.progress()).toMatchObject({ keys: '2 of 2 keys', tokens: '≈ 2 k tokens' });
        expect(presenter.cells()).toEqual([{ index: 0, state: 'done', title: 'Chunk 1: done' }]);
        expect(presenter.log()).toContain('Chunk 1 of 1 completed');
    });

    it('follows main: an update of its run asks again, and one of another run does not', async () => {
        // arrange
        const { presenter, emit, change, request } = await loaded();
        const asked = (): number => request.mock.calls.filter(([method]) => method === 'generate.get').length;
        const before = asked();

        // act
        emit({ type: 'generate.updated', runId: 'other' });
        expect(asked()).toBe(before);
        change({ ...RUN, status: 'running' });
        emit({ type: 'generate.updated', runId: 'run1' });

        // assert
        await vi.waitFor(() => expect(presenter.run()?.status).toBe('running'));
    });

    it('filters what needs attention, and switches the locale', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        presenter.pickFilter('attention');

        // assert
        expect(presenter.rows().map((row) => row.key)).toEqual(['loc.b']);
        expect(presenter.rows()[0].isDanger).toBe(true);
        expect(presenter.attentionCount()).toBe(1);
        expect(presenter.localeSwitch().map((locale) => [locale.name, locale.isChecked])).toEqual([['French', true], ['German', false]]);

        await presenter.pickLocale('de');
        expect(request).toHaveBeenLastCalledWith('generate.get', { runId: 'run1', locale: 'de' });
    });

    it('disables Write with the reason while Dry run is on, while it translates, and with nothing to write', async () => {
        // act & assert
        expect((await loaded()).presenter.writeBlocker()).toContain('Dry run is on');
        TestBed.resetTestingModule();

        expect((await loaded({ ...RUN, status: 'running' }, false)).presenter.writeBlocker()).toContain('Pause the run first');
        TestBed.resetTestingModule();

        const none = { ...RUN, locales: [{ ...RUN.locales[0], writable: 0 }] };

        expect((await loaded(none, false)).presenter.writeBlocker()).toContain('No accepted translation');
    });

    it('allows Write when paused, failed or done, and says how many', async () => {
        // arrange
        const { presenter, request } = await loaded({ ...RUN, status: 'paused' }, false);

        // act
        expect(presenter.writeBlocker()).toBeNull();
        expect(presenter.writeLabel()).toBe('Write 1 accepted');
        await presenter.write();

        // assert
        expect(request).toHaveBeenCalledWith('generate.write', { runId: 'run1', locale: 'fr' });
        expect(presenter.outcome()?.state).toBe('applied');
    });

    it('shows a failed write and writes nothing on its own', async () => {
        // arrange
        const { presenter, request } = await loaded(RUN, false);

        request.mockImplementationOnce(() => Promise.reject(new Error('lang.fr.json changed')));

        // act
        await presenter.write();

        // assert
        expect(presenter.message()).toBe('lang.fr.json changed');
        expect(presenter.outcome()).toBeNull();
    });

    it('asks main to pause, resume and stop', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        await presenter.pause();
        await presenter.resume();
        await presenter.stop();

        // assert
        expect(request).toHaveBeenCalledWith('generate.pause', { runId: 'run1' });
        expect(request).toHaveBeenCalledWith('generate.resume', { runId: 'run1' });
        expect(request).toHaveBeenCalledWith('generate.stop', { runId: 'run1' });
    });

    it('shows what the user types at once, and tells main shortly after', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        presenter.edit('loc.b', 'Deux {0}');

        // assert
        expect(presenter.rows()[1].value).toBe('Deux {0}');
        await vi.waitFor(() => expect(request).toHaveBeenCalledWith('generate.setRow', { runId: 'run1', locale: 'fr', key: 'loc.b', value: 'Deux {0}' }));
    });

    it('tells main about an accepted row only when it changed, because a checkbox reports the state it was bound to', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        await presenter.accept(RUN.rows[0], true);
        await presenter.accept(RUN.rows[0], false);

        // assert
        expect(request.mock.calls.filter(([method]) => method === 'generate.setRow')).toEqual([['generate.setRow', { runId: 'run1', locale: 'fr', key: 'loc.a', accepted: false }]]);
    });

    it('starts a new run with the same setup', async () => {
        // arrange
        const { presenter, navigate } = await loaded();

        // act
        await presenter.again();

        // assert
        expect(navigate).toHaveBeenCalledWith(['/generate/runs', 'run2']);
    });

    it('says when a run is gone', async () => {
        // arrange
        const context = setUp();

        context.request.mockImplementation((method: string) => method === 'generate.get' ? Promise.reject(new Error('This run is no longer held by the app.')) : Promise.resolve([]));

        // act
        await context.presenter.load();

        // assert
        expect(context.presenter.error()).toContain('no longer held');
    });
});
