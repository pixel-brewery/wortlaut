// #region Imports

import { TestBed } from '@angular/core/testing';
import type { OutputRow, TransformOverview } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeState, TransformViewPresenter } from './TransformViewPresenter';

// #endregion

const OVERVIEW: TransformOverview = {
    source: 'lang.*.json',
    formats: [
        { id: 'ts', name: 'TypeScript', description: 'Classes.', enabled: true },
        { id: 'resx', name: 'RESX', description: 'XML.', enabled: true },
        { id: 'po', name: 'PO', description: 'Gettext.', enabled: false }
    ],
    order: 'asc',
    keyCount: 12,
    fileCount: 2
};

const ROWS: Array<OutputRow> = [
    { file: 'lang.de.ts', keys: 12, state: 'unchanged', preview: 'de', previewTruncated: false },
    { file: 'lang.en.ts', keys: 12, state: 'would-be-written', preview: 'en', previewTruncated: false }
];

function setUp() {
    let latest: unknown = null;
    const request = vi.fn((method: string, payload: { command?: string; projectId?: string }): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'transform.overview':
                return Promise.resolve(OVERVIEW);
            case 'run.print':
                return Promise.resolve({ command: `npx wortlaut ${payload.command}` });
            case 'run.active':
                return Promise.resolve([]);
            case 'run.latest':
                return Promise.resolve(payload.command === 'transform' ? latest : null);
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({ providers: [TransformViewPresenter, { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } }] });

    return {
        presenter: TestBed.inject(TransformViewPresenter),
        session: TestBed.inject(ShellSession),
        request,
        setLatest(value: unknown) {
            latest = value;
        }
    };
}

describe('describeState', () => {
    it('says what happened to a file', () => {
        expect(describeState('written').label).toBe('Written');
        expect(describeState('unchanged').label).toBe('Unchanged, not written');
        expect(describeState('would-be-written').label).toBe('Would be written');
    });
});

describe('TransformViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('takes its formats from the engine and counts the ones that are on', async () => {
        // arrange
        const { presenter, session } = setUp();

        await session.refresh();

        // act
        await presenter.load();

        // assert
        expect(presenter.formats().map((format) => [format.id, format.isChecked])).toEqual([['ts', true], ['resx', true], ['po', false]]);
        expect(presenter.transformLabel()).toBe('Transform 2 formats');
        expect(presenter.sortNote()).toBe('12 keys in 2 files');

        // act
        presenter.setFormat('ts', false);
        presenter.setFormat('resx', false);

        // assert
        expect(presenter.transformLabel()).toBe('Transform 0 formats');
        expect(presenter.canTransform()).toBe(false);
    });

    it('prints a line for each command, and no transform without a format', async () => {
        // arrange
        const { presenter, session } = setUp();

        await session.refresh();
        await presenter.load();

        // assert
        expect(presenter.sameAs.value()).toEqual(['npx wortlaut transform', 'npx wortlaut sort']);

        // act
        presenter.setFormat('ts', false);
        presenter.setFormat('resx', false);
        await presenter.sameAs.reload();

        // assert
        expect(presenter.sameAs.value()).toEqual(['npx wortlaut sort']);
    });

    it('previews the first file that changes, and the one the user picks', async () => {
        // arrange
        const { presenter, session, setLatest } = setUp();

        setLatest({ runId: 'r1', command: 'transform', projectId: 'p1', state: 'succeeded', dryRun: true, failure: null, outcome: null, output: { command: 'transform', rows: ROWS } });
        await session.refresh();

        // act
        await presenter.load();

        // assert
        expect(presenter.selectedFile()?.preview).toBe('en');
        expect(presenter.resultTitle()).toBe('Result of the dry run');

        // act
        presenter.pick('lang.de.ts');

        // assert
        expect(presenter.selectedFile()?.preview).toBe('de');
    });
});
