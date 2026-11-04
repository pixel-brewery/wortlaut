// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { WorkspaceCard } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacesViewPresenter } from './WorkspacesViewPresenter';

// #endregion

const FOLDER = { token: '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b', displayPath: '~/shop', name: 'shop' };
const CARD: WorkspaceCard = { id: 'w1', code: 'AC', color: 'teal', name: 'Acme', projectCount: 1, keyCount: 858, locales: ['en', 'de'], folderMissing: false, folder: '~/shop', nxTarget: null, provider: null, failingProjects: 0 };

function setUp(request: (method: string, payload: unknown) => Promise<unknown>) {
    const navigate = vi.fn(() => Promise.resolve(true));
    const api = { request: vi.fn(request) };

    TestBed.configureTestingModule({
        providers: [WorkspacesViewPresenter, { provide: DesktopApi, useValue: api }, { provide: Router, useValue: { navigate } }]
    });

    return { presenter: TestBed.inject(WorkspacesViewPresenter), navigate, api };
}

describe('WorkspacesViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('bounds workspace cards and keeps the final workspace reachable', async () => {
        // arrange
        const cards = Array.from({ length: 76 }, (_, index) => ({ ...CARD, id: `workspace-${index}` }));
        const { presenter } = setUp(() => Promise.resolve(cards));
        await presenter.workspaces.reload();
        expect(presenter.cards()).toHaveLength(50);

        // act
        presenter.showMore();

        // assert
        expect(presenter.cards().at(-1)?.id).toBe('workspace-75');
        expect(presenter.hasMore()).toBe(false);
    });

    it('writes facts and tags from the last known state', () => {
        const { presenter } = setUp(() => Promise.resolve(null));

        expect(presenter.factsOf(CARD)).toEqual([
            { label: 'Projects', value: '1' },
            { label: 'Keys', value: '858' },
            { label: 'Locales', value: 'en, de' },
            { label: 'AI', value: 'Not set up' }
        ]);
        expect(presenter.tagsOf(CARD)).toEqual([{ label: 'This computer', variant: 'neutral' }]);
        expect(presenter.factsOf({ ...CARD, locales: [] })[2].value).toBe('None yet');
    });

    it('names the Nx target and what is wrong', () => {
        const { presenter } = setUp(() => Promise.resolve(null));
        const card = { ...CARD, projectCount: 26, nxTarget: 'intl', failingProjects: 2, folderMissing: true };

        expect(presenter.factsOf(card)[0].value).toBe('26 from Nx');
        expect(presenter.tagsOf(card)).toEqual([
            { label: 'This computer', variant: 'neutral' },
            { label: 'Nx target intl', variant: 'info' },
            { label: 'The folder is gone', variant: 'danger' },
            { label: '2 projects with open problems', variant: 'warning' }
        ]);
    });

    it('lets the short code follow the name', () => {
        const { presenter } = setUp(() => Promise.resolve(null));

        presenter.form.name().value.set('Pixel Brewery');

        expect(presenter.code()).toBe('PB');
    });

    it('keeps Create workspace disabled until name and folder are set', async () => {
        const { presenter } = setUp(() => Promise.resolve({ folder: FOLDER }));

        expect(presenter.canCreate()).toBe(false);

        presenter.form.name().value.set('Acme');
        expect(presenter.canCreate()).toBe(false);

        await presenter.chooseFolder();
        expect(presenter.canCreate()).toBe(true);

        presenter.form.name().value.set('   ');
        expect(presenter.canCreate()).toBe(false);
    });

    it('keeps the chosen folder when the dialog is cancelled', async () => {
        const answers = [{ folder: FOLDER }, { folder: null }];
        const { presenter } = setUp(() => Promise.resolve(answers.shift()));

        await presenter.chooseFolder();
        await presenter.chooseFolder();

        expect(presenter.folder()).toEqual(FOLDER);
    });

    it('creates with the token and goes on to Project setup', async () => {
        const { presenter, api, navigate } = setUp((method) => Promise.resolve(method === 'dialog.chooseFolder' ? { folder: FOLDER } : { workspaceId: 'w9', discovered: 0, next: 'setup' }));

        presenter.form.name().value.set('Acme');
        presenter.pickColor('orange');
        await presenter.chooseFolder();
        await presenter.create();

        expect(api.request).toHaveBeenCalledWith('workspace.create', { name: 'Acme', code: 'AC', color: 'orange', folderToken: FOLDER.token });
        expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { folder: FOLDER.token, workspace: 'w9' } });
    });

    it('goes to the projects a repository brought along', async () => {
        const { presenter, navigate } = setUp((method) => Promise.resolve(method === 'dialog.chooseFolder' ? { folder: FOLDER } : { workspaceId: 'w9', discovered: 3, next: 'projects' }));

        presenter.form.name().value.set('Acme');
        await presenter.chooseFolder();
        await presenter.create();

        expect(navigate).toHaveBeenCalledWith(['/projects']);
    });

    it('does nothing without a folder', async () => {
        const { presenter, api } = setUp(() => Promise.resolve(null));

        presenter.form.name().value.set('Acme');
        await presenter.create();

        expect(api.request).not.toHaveBeenCalled();
    });

    it('stays with a message when creating fails', async () => {
        const { presenter, navigate } = setUp((method) => method === 'dialog.chooseFolder' ? Promise.resolve({ folder: FOLDER }) : Promise.reject(new Error('The workspace list cannot be read.')));

        presenter.form.name().value.set('Acme');
        await presenter.chooseFolder();
        await presenter.create();

        expect(presenter.message()).toBe('The workspace list cannot be read.');
        expect(navigate).not.toHaveBeenCalled();
        expect(presenter.busy()).toBe(false);
    });

    it('opens a workspace, or its settings', async () => {
        const { presenter, navigate } = setUp(() => Promise.resolve({ next: 'projects' }));

        await presenter.open('w1');
        expect(navigate).toHaveBeenLastCalledWith(['/projects']);

        await presenter.openSettings('w1');
        expect(navigate).toHaveBeenLastCalledWith(['/settings/workspace']);
    });

    it('marks the picked color', () => {
        const { presenter } = setUp(() => Promise.resolve(null));

        presenter.pickColor('green');

        expect(presenter.colors().filter((color) => color.isChecked).map((color) => color.id)).toEqual(['green']);
    });
});
