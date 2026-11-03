// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { RulePackCheck } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessLines, RulePackAddViewPresenter } from './RulePackAddViewPresenter';
import { RulePacksViewPresenter } from './RulePacksViewPresenter';

// #endregion

const TOKEN = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';
const ACCESS = { declarative: true, readsCatalogs: true, readsSource: false, network: false, ai: false };
const PASSED: RulePackCheck = {
    checkId: 'check-1',
    source: 'github:owner/rules',
    sameAs: 'npx wortlaut rules add github:owner/rules',
    problem: null,
    pack: { id: 'our-pack', name: 'Our pack', description: 'Ours.', version: '1.0.0', commit: 'b15c1db0000000000000000000000000000000000', hash: `sha256:${'a'.repeat(60)}7d36`, rules: [{ id: 'no-todo', description: 'No TODO.', severity: 'error' }], access: ACCESS },
    targets: [{ target: { kind: 'workspace', workspaceId: 'w1' }, label: 'Workspace Shop' }, { target: { kind: 'project', projectId: 'p1' }, label: 'Only project shop' }],
    targetsNote: null
};
const WRITE = { results: [{ repository: '~/shop', outcome: { state: 'pending' as const, changeSetId: 'c1', runId: 'r1', files: ['wortlaut.lock.json'] }, failure: null }] };

function setUp(check: RulePackCheck = PASSED, query: Record<string, string> = {}) {
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'rulePack.check':
                return Promise.resolve(check);
            case 'rulePack.install':
                return Promise.resolve(WRITE);
            case 'dialog.chooseFolder':
                return Promise.resolve({ folder: { token: TOKEN, displayPath: '~/shop/rules/ours', name: 'ours' } });
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });
    const showWrite = vi.fn(() => Promise.resolve());
    const navigate = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
        providers: [
            RulePackAddViewPresenter,
            { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
            { provide: RulePacksViewPresenter, useValue: { showWrite } },
            { provide: Router, useValue: { navigate } },
            { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }
        ]
    });

    return { presenter: TestBed.inject(RulePackAddViewPresenter), request, showWrite, navigate };
}

function type(presenter: RulePackAddViewPresenter, value: string): void {
    presenter.form.source().value.set(value);
}

describe('RulePackAddViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('starts on GitHub, with nothing to check and nothing to install', () => {
        // act
        const { presenter } = setUp();

        // assert
        expect(presenter.kinds().map((kind) => [kind.name, kind.isOn])).toEqual([['GitHub', true], ['npm', false], ['Folder', false]]);
        expect(presenter.field().label).toBe('GitHub repository');
        expect(presenter.canCheck()).toBe(false);
        expect(presenter.canInstall()).toBe(false);
    });

    it('keeps Install and pin disabled until a check passed, then pins what was checked', async () => {
        // arrange
        const { presenter, request, showWrite, navigate } = setUp();

        type(presenter, 'github:owner/rules');
        expect(presenter.canCheck()).toBe(true);
        expect(presenter.canInstall()).toBe(false);

        // act
        await presenter.checkPack();

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.check', { source: { kind: 'github', value: 'github:owner/rules' } });
        expect(presenter.pack()?.name).toBe('Our pack');
        expect(presenter.pinLine()).toBe('Commit b15c1db · sha256:aaaaaaaa…7d36');
        expect(presenter.sameAs()).toBe('npx wortlaut rules add github:owner/rules');
        expect(presenter.targets().map((target) => target.label)).toEqual(['Workspace Shop', 'Only project shop']);
        expect(presenter.canInstall()).toBe(true);

        // act
        await presenter.install();

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.install', { checkId: 'check-1', target: { kind: 'workspace', workspaceId: 'w1' } });
        expect(showWrite).toHaveBeenCalledWith(WRITE);
        expect(navigate).toHaveBeenCalledWith(['/rule-packs']);
    });

    it('pins for the choice of Add to', async () => {
        // arrange
        const { presenter, request } = setUp();

        type(presenter, 'github:owner/rules');
        await presenter.checkPack();
        presenter.form.target().value.set('1');

        // act
        await presenter.install();

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.install', { checkId: 'check-1', target: { kind: 'project', projectId: 'p1' } });
    });

    it('shows inline why a pack cannot be added, and cannot install it', async () => {
        // arrange
        const refused: RulePackCheck = { checkId: null, source: 'x', sameAs: null, problem: { kind: 'has-code', message: 'This pack holds code.', details: ['hook.js'] }, pack: null, targets: [], targetsNote: null };
        const { presenter } = setUp(refused);

        type(presenter, 'github:owner/rules');

        // act
        await presenter.checkPack();
        await presenter.install();

        // assert
        expect(presenter.problem()).toMatchObject({ kind: 'has-code', details: ['hook.js'] });
        expect(presenter.canInstall()).toBe(false);
    });

    it('names a folder only by the token of a native dialog', async () => {
        // arrange
        const { presenter, request } = setUp();

        presenter.setKind('folder');
        expect(presenter.canCheck()).toBe(false);

        // act
        await presenter.chooseFolder();
        await presenter.checkPack();

        // assert
        expect(presenter.folderPath()).toBe('~/shop/rules/ours');
        expect(request).toHaveBeenCalledWith('rulePack.check', { source: { kind: 'folder', folderToken: TOKEN } });
    });

    it('says when a folder can go nowhere, and cannot install it', async () => {
        // arrange
        const outside: RulePackCheck = { ...PASSED, checkId: null, targets: [], targetsNote: 'This folder lies outside of every repository.' };
        const { presenter } = setUp(outside);

        type(presenter, 'github:owner/rules');

        // act
        await presenter.checkPack();

        // assert
        expect(presenter.targetsNote()).toMatch(/outside of every repository/);
        expect(presenter.canInstall()).toBe(false);
    });

    it('forgets a check when the kind changes', async () => {
        // arrange
        const { presenter } = setUp();

        type(presenter, 'github:owner/rules');
        await presenter.checkPack();

        // act
        presenter.setKind('npm');

        // assert
        expect(presenter.pack()).toBeNull();
        expect(presenter.canInstall()).toBe(false);
        expect(presenter.form.source().value()).toBe('');
    });

    it('fills in a pack of Available, and still checks it first', async () => {
        // act
        const { presenter, request } = setUp(PASSED, { source: 'wortlaut:message-checks' });

        // assert
        expect(presenter.kinds().map((kind) => kind.name)).toEqual(['GitHub', 'npm', 'Folder', 'Included']);
        expect(presenter.kinds().at(-1)?.isOn).toBe(true);
        expect(presenter.form.source().value()).toBe('wortlaut:message-checks');
        expect(presenter.canInstall()).toBe(false);

        // act
        await presenter.checkPack();

        // assert
        expect(request).toHaveBeenCalledWith('rulePack.check', { source: { kind: 'shipped', value: 'wortlaut:message-checks' } });
    });

    it('closes without writing anything', async () => {
        // arrange
        const { presenter, request, navigate } = setUp();

        // act
        await presenter.close();

        // assert
        expect(navigate).toHaveBeenCalledWith(['/rule-packs']);
        expect(request).not.toHaveBeenCalled();
    });
});

describe('accessLines', () => {
    it('writes what a pack may do', () => {
        expect(accessLines(ACCESS).map((line) => [line.label, line.variant])).toEqual([
            ['Reads your catalogs', 'neutral'],
            ['Does not read source code', 'success'],
            ['No network access', 'success'],
            ['Does not use AI', 'success']
        ]);
    });
});
