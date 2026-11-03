// #region Imports

import { TestBed } from '@angular/core/testing';
import type { ReviewDetail, ReviewItem } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewViewPresenter, titleOf } from './ReviewViewPresenter';

// #endregion

const ITEM: ReviewItem = { id: 'c1', command: 'sort', surface: 'desktop', detail: null, createdAt: new Date().toISOString(), projectName: 'shop', partial: false, fileCount: 2, findingCount: 0, conflicts: [] };
const DETAIL: ReviewDetail = { ...ITEM, files: [{ file: 'lang.en.json', action: 'update', additions: 1, deletions: 1, hasConflict: false, hunks: [], truncated: false }], findings: [] };

function setUp(state: { dryRun: boolean; items?: Array<ReviewItem>; apply?: () => Promise<unknown> }) {
    let items = state.items ?? [ITEM];
    const shell = { workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: null, provider: null, dryRun: state.dryRun, pendingChanges: items.length };
    const request = vi.fn((method: string, payload: { id?: string }): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve(shell);
            case 'run.active':
                return Promise.resolve([]);
            case 'changes.list':
                return Promise.resolve(items);
            case 'changes.recovered':
                return Promise.resolve([]);
            case 'changes.get':
                return Promise.resolve({ ...DETAIL, ...items.find((item) => item.id === payload.id) });
            case 'changes.apply':
                return (state.apply ?? (() => Promise.resolve({ state: 'applied', changeSetId: 'c1', runId: 'r1', files: ['lang.en.json'] })))().then((value) => {
                    items = [];

                    return value;
                });
            case 'changes.discard':
                items = [];

                return Promise.resolve({});
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({ providers: [ReviewViewPresenter, { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } }] });

    return { presenter: TestBed.inject(ReviewViewPresenter), session: TestBed.inject(ShellSession), request };
}

describe('ReviewViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('selects the newest change set and shows its diff', async () => {
        // arrange
        const { presenter, session } = setUp({ dryRun: false });

        await session.refresh();

        // act
        await presenter.load();

        // assert
        expect(presenter.selectedId()).toBe('c1');
        expect(presenter.detail.value()?.files[0].file).toBe('lang.en.json');
        expect(presenter.title()).toBe('Sort keys');
    });

    it('does not write while Dry run is on', async () => {
        // arrange
        const { presenter, session, request } = setUp({ dryRun: true });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.approve();

        // assert
        expect(presenter.canApply()).toBe(false);
        expect(request).not.toHaveBeenCalledWith('changes.apply', expect.anything());
    });

    it('writes with Dry run off, says what it wrote and moves on', async () => {
        // arrange
        const { presenter, session, request } = setUp({ dryRun: false });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.approve();

        // assert
        expect(request).toHaveBeenCalledWith('changes.apply', { id: 'c1' });
        expect(presenter.outcome()).toMatchObject({ state: 'applied', files: ['lang.en.json'] });
        expect(presenter.selectedId()).toBeNull();
    });

    it('names the file when a change set fails, and keeps it in the list', async () => {
        // arrange
        const { presenter, session } = setUp({ dryRun: false, apply: () => Promise.reject(new Error('lang.en.json changed since the change set was built. Nothing was written.')) });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.approve();

        // assert
        expect(presenter.message()).toContain('lang.en.json changed');
        expect(presenter.list.value()?.length).toBe(1);
    });

    it('cannot write a change set whose files changed', async () => {
        // arrange
        const { presenter, session } = setUp({ dryRun: false, items: [{ ...ITEM, conflicts: ['lang.en.json'] }] });

        await session.refresh();

        // act
        await presenter.load();

        // assert
        expect(presenter.canApply()).toBe(false);
    });

    it('discards without writing', async () => {
        // arrange
        const { presenter, session, request } = setUp({ dryRun: true });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.discard();

        // assert
        expect(request).toHaveBeenCalledWith('changes.discard', { id: 'c1' });
        expect(presenter.list.value()).toEqual([]);
    });

    it('names the commands that leave a change set', () => {
        // act & assert
        expect(titleOf({ command: 'detect.apply' })).toBe('Hard-coded strings');
        expect(titleOf({ command: 'init' })).toBe('Configuration file');
    });
});
