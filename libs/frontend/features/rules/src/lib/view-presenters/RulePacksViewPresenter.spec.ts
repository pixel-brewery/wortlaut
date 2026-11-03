// #region Imports

import { TestBed } from '@angular/core/testing';
import type { RulePackEntry, RulePackUpdate } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessBadges, RulePacksViewPresenter, shortHash, sourceRows } from './RulePacksViewPresenter';

// #endregion

const HASH = `sha256:${'a'.repeat(60)}7d36`;
const BUILT_IN: RulePackEntry = {
    id: 'builtin',
    name: 'Built-in rules',
    description: 'Included with Wortlaut.',
    locked: true,
    enabled: true,
    rules: [{ id: 'empty-values', description: 'A key exists but has no text.', severity: 'error', result: 'Pass', variant: 'success' }],
    refusal: null,
    source: 'Included with Wortlaut',
    version: null,
    commit: null,
    hash: null,
    access: { declarative: false, readsCatalogs: true, readsSource: true, network: false, ai: false },
    repositories: []
};
const PACK: RulePackEntry = {
    id: 'message-checks',
    name: 'Message checks',
    description: 'Placeholders and more.',
    locked: false,
    enabled: true,
    rules: [{ id: 'icu-syntax', description: 'Valid messages.', severity: 'error', result: '2 projects failing', variant: 'danger' }],
    refusal: null,
    source: 'github:owner/rules',
    version: '1.0.0',
    commit: 'b15c1db0000000000000000000000000000000000',
    hash: HASH,
    access: { declarative: true, readsCatalogs: true, readsSource: false, network: false, ai: false },
    repositories: ['~/shop']
};
const UPDATE: RulePackUpdate = {
    packId: 'message-checks',
    name: 'Message checks',
    available: true,
    failure: null,
    updateId: 'update-1',
    summary: '1 new rule, commit 7e21c04',
    next: { version: '1.1.0', commit: '7e21c04000000000000000000000000000000000', hash: HASH },
    access: PACK.access,
    rules: [{ id: 'new-rule', change: 'added', description: 'New.' }],
    repositories: [{ repository: '~/shop', commit: PACK.commit, version: '1.0.0', hash: HASH, files: [] }]
};
const WRITE = { results: [{ repository: '~/shop', outcome: { state: 'pending' as const, changeSetId: 'c1', runId: 'r1', files: ['wortlaut.lock.json'] }, failure: null }] };

function setUp(list: Array<RulePackEntry> = [BUILT_IN, PACK], update: RulePackUpdate = UPDATE) {
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: null, provider: null, dryRun: true, pendingChanges: 0 });
            case 'run.active':
                return Promise.resolve([]);
            case 'rulePack.list':
                return Promise.resolve(list);
            case 'rulePack.available':
                return Promise.resolve([{ id: 'x', name: 'X', description: 'X.', source: 'wortlaut:x' }]);
            case 'rulePack.checkUpdate':
                return Promise.resolve(update);
            case 'rulePack.setEnabled':
            case 'rulePack.setSeverity':
            case 'rulePack.update':
                return Promise.resolve(WRITE);
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({
        providers: [RulePacksViewPresenter, { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } }]
    });

    return { presenter: TestBed.inject(RulePacksViewPresenter), request };
}

describe('RulePacksViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('shows the packs, and asks the source of a pack it selects', async () => {
        // arrange
        const { presenter, request } = setUp();

        // act
        await presenter.load();
        await presenter.pick('message-checks');

        // assert
        expect(presenter.packs().map((pack) => [pack.name, pack.count, pack.isSelected])).toEqual([['Built-in rules', '1 rule', false], ['Message checks', '1 rule', true]]);
        expect(request).toHaveBeenCalledWith('rulePack.checkUpdate', { workspaceId: 'w1', packId: 'message-checks' });
        expect(presenter.canReviewUpdate()).toBe(true);
        expect(presenter.sourceRows().find((row) => row.label === 'Update available')?.value).toBe('1 new rule, commit 7e21c04');
    });

    it('never asks a source about the built-in rules', async () => {
        // arrange
        const { presenter, request } = setUp([BUILT_IN]);

        // act
        await presenter.load();

        // assert
        expect(request).not.toHaveBeenCalledWith('rulePack.checkUpdate', expect.anything());
        expect(presenter.canReviewUpdate()).toBe(false);
    });

    it('selects a pack that failed its verification first, and it cannot be turned on', async () => {
        // arrange
        const refused: RulePackEntry = { ...PACK, enabled: false, refusal: { reason: 'Its content hash does not match.', repository: '~/shop', pinnedHash: HASH, foundHash: `sha256:${'f'.repeat(64)}` } };
        const { presenter, request } = setUp([BUILT_IN, refused]);

        // act
        await presenter.load();
        await presenter.setEnabled(true);

        // assert
        expect(presenter.selected()?.id).toBe('message-checks');
        expect(presenter.packs()[1].isRefused).toBe(true);
        expect(presenter.sourceRows().find((row) => row.label === 'Found on disk')?.value).toBe(shortHash(`sha256:${'f'.repeat(64)}`));
        expect(request).not.toHaveBeenCalledWith('rulePack.setEnabled', expect.anything());
    });

    it('sets a severity through a change, and ignores a select that reports what it was bound to', async () => {
        // arrange
        const { presenter, request } = setUp();

        await presenter.load();
        await presenter.pick('message-checks');

        // act
        await presenter.setSeverity('icu-syntax', 'error');

        // assert
        expect(request).not.toHaveBeenCalledWith('rulePack.setSeverity', expect.anything());

        // act
        await presenter.setSeverity('icu-syntax', 'warning');

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.setSeverity', { workspaceId: 'w1', ruleId: 'icu-syntax', severity: 'warning' });
        expect(presenter.results()[0].outcome?.state).toBe('pending');
    });

    it('builds a select anew after a write, so it shows where the rule stands', async () => {
        // arrange
        const { presenter } = setUp();

        await presenter.load();
        await presenter.pick('message-checks');

        const before = presenter.rules()[0].track;

        // act
        await presenter.setSeverity('icu-syntax', 'off');

        // assert
        expect(presenter.rules()[0].track).not.toBe(before);
    });

    it('turns a pack off, and ignores a switch that reports what it was bound to', async () => {
        // arrange
        const { presenter, request } = setUp();

        await presenter.load();
        await presenter.pick('message-checks');

        // act
        await presenter.setEnabled(true);
        await presenter.setEnabled(false);

        // assert
        expect(request.mock.calls.filter(([method]) => method === 'rulePack.setEnabled')).toEqual([['rulePack.setEnabled', { workspaceId: 'w1', packId: 'message-checks', enabled: false }]]);
    });

    it('writes an update only after its review was approved', async () => {
        // arrange
        const { presenter, request } = setUp();

        await presenter.load();
        await presenter.pick('message-checks');

        // act
        presenter.openReview();

        // assert
        expect(presenter.reviewing()?.packId).toBe('message-checks');
        expect(presenter.reviewPin()).toEqual([{ label: 'New commit', value: '7e21c04' }, { label: 'New content hash', value: shortHash(HASH) }]);
        expect(request).not.toHaveBeenCalledWith('rulePack.update', expect.anything());

        // act
        presenter.closeReview();

        // assert
        expect(presenter.reviewing()).toBeNull();
        expect(request).not.toHaveBeenCalledWith('rulePack.update', expect.anything());

        // act
        presenter.openReview();
        await presenter.approveUpdate();

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.update', { workspaceId: 'w1', updateId: 'update-1' });
        expect(presenter.reviewing()).toBeNull();
    });
});

describe('what Rule packs says', () => {
    it('writes the access of a pack as its badges', () => {
        expect(accessBadges(PACK.access).map((badge) => [badge.label, badge.variant])).toEqual([
            ['Declarative, runs no code', 'success'],
            ['Reads catalogs', 'neutral'],
            ['No source code', 'success'],
            ['No network', 'success']
        ]);
        expect(accessBadges(BUILT_IN.access).map((badge) => badge.label)).toEqual(['Reads catalogs', 'Reads source code', 'No network']);
    });

    it('writes the rows of Source and trust', () => {
        expect(sourceRows(BUILT_IN, null, '0.2.0')).toEqual([{ label: 'Source', value: 'Included with Wortlaut' }, { label: 'Version', value: '0.2.0' }]);
        expect(sourceRows(PACK, null, '0.2.0')).toEqual([
            { label: 'Source', value: 'github:owner/rules' },
            { label: 'Version', value: '1.0.0' },
            { label: 'Pinned commit', value: 'b15c1db' },
            { label: 'Content hash', value: shortHash(HASH) }
        ]);
        expect(sourceRows(PACK, { ...UPDATE, available: false, failure: 'It did not answer.' }, null).at(-1)).toEqual({ label: 'Update check', value: 'It did not answer.' });
    });

    it('shortens a hash', () => {
        expect(shortHash(HASH)).toBe('sha256:aaaaaaaa…7d36');
    });
});
