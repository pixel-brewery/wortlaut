// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ProjectSettings, WorkspaceDetail } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsProjectViewPresenter } from './SettingsProjectViewPresenter';
import { SettingsWorkspaceViewPresenter } from './SettingsWorkspaceViewPresenter';

// #endregion

const WORKSPACE: WorkspaceDetail = {
    id: 'w1', code: 'AC', color: 'orange', name: 'Acme',
    repositories: [{ displayPath: '~/shop', missing: false }],
    scanForProjects: true,
    defaults: { baseLocale: 'en', targetLocales: ['de'], preset: 'angular', provider: null },
    rulePackCount: 0
};

const PROJECT: ProjectSettings = {
    name: 'shop', workingDirectory: '~/shop', sourceRoot: 'src', resourceRoots: ['i18n'], preset: 'react', format: 'resx', prefix: 'loc', suffix: '',
    baseLocale: 'de', targetLocales: ['en'], rules: [{ id: 'empty-values', enabled: true }], usedKeys: [], identicalKeys: [], identicalValues: []
};

function setUp<T>(presenter: new () => T, state: unknown, answer: unknown, answers: Record<string, unknown> = {}) {
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        if (method in answers) {
            const value = answers[method];

            return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
        }

        switch (method) {
            case 'shell.state':
                return Promise.resolve(state);
            case 'run.active':
                return Promise.resolve([]);
            default:
                return Promise.resolve(answer);
        }
    });

    TestBed.configureTestingModule({ providers: [presenter, { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } }, { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } }] });

    return { presenter: TestBed.inject(presenter), session: TestBed.inject(ShellSession), request };
}

const OPEN = { workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 };

describe('SettingsWorkspaceViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('fails plainly without an open workspace', async () => {
        const { presenter } = setUp(SettingsWorkspaceViewPresenter, null, WORKSPACE);

        await presenter.workspace.reload();

        expect(presenter.workspace.error()).toBe('No workspace is open.');
    });

    it('shows the true values of the open workspace', async () => {
        const { presenter, session, request } = setUp(SettingsWorkspaceViewPresenter, OPEN, WORKSPACE);

        await session.refresh();
        await presenter.load();

        expect(request).toHaveBeenCalledWith('workspace.get', { workspaceId: 'w1' });
        expect(presenter.form.baseLocale().value()).toBe('en');
        expect(presenter.form.preset().value()).toBe('angular');
        expect(presenter.provider()).toBe('Not set up');
        expect(presenter.rulePacks()).toBe('No packs enabled');
        expect(presenter.colors().filter((color) => color.isChecked).map((color) => color.id)).toEqual(['orange']);
    });

    it('says when a workspace has no defaults yet', async () => {
        const { presenter, session } = setUp(SettingsWorkspaceViewPresenter, OPEN, { ...WORKSPACE, defaults: { baseLocale: null, targetLocales: [], preset: null, provider: null } });

        await session.refresh();
        await presenter.load();

        expect(presenter.form.baseLocale().value()).toBe('');
        expect(presenter.form.preset().value()).toBe('');
    });
});

describe('SettingsProjectViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('holds nothing without an open project', async () => {
        const { presenter, request } = setUp(SettingsProjectViewPresenter, null, PROJECT);

        await presenter.settings.reload();

        expect(presenter.hasProject()).toBe(false);
        expect(presenter.settings.value()).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    it('shows the true values of the open project', async () => {
        const { presenter, session, request } = setUp(SettingsProjectViewPresenter, OPEN, PROJECT);

        await session.refresh();
        await presenter.load();

        expect(request).toHaveBeenCalledWith('project.settings', { projectId: 'p1' });
        expect(presenter.form.preset().value()).toBe('react');
        expect(presenter.form.format().value()).toBe('resx');
        expect(presenter.form.baseLocale().value()).toBe('de');
        expect(presenter.baseLocales()).toEqual([{ code: 'de', label: 'German (de)' }, { code: 'en', label: 'English (en)' }]);
    });

    it('saves only what changed, through a change set', async () => {
        // arrange
        const { presenter, session, request } = setUp(SettingsProjectViewPresenter, OPEN, PROJECT, { 'config.update': { state: 'pending', changeSetId: 'c1', runId: 'r1', files: ['wortlaut.config.json'] } });

        await session.refresh();
        await presenter.load();

        // assert
        expect(presenter.isDirty()).toBe(false);

        // act
        presenter.form.prefix().value.set('app');
        presenter.entriesForm.usedKeys().value.set('loc.*');
        presenter.addEntry('usedKeys');
        presenter.setRule('empty-values', false);
        await presenter.save();

        // assert
        expect(request).toHaveBeenCalledWith('config.update', { projectId: 'p1', changes: { prefix: 'app', rules: [], usedKeys: ['loc.*'] } });
        expect(presenter.outcome()?.state).toBe('pending');
    });

    it('names a folder by its token and keeps Discard honest', async () => {
        // arrange
        const { presenter, session, request } = setUp(SettingsProjectViewPresenter, OPEN, PROJECT, { 'dialog.chooseFolder': { folder: { token: 't1', displayPath: '~/shop/locales', name: 'locales' } }, 'config.update': { state: 'applied', changeSetId: 'c1', runId: 'r1', files: [] } });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.addResourceRoot();
        presenter.removeResourceRoot({ index: 0, token: null });

        // assert
        expect(request).toHaveBeenCalledWith('dialog.chooseFolder', { insideToken: null, insideProjectId: 'p1' });
        expect(presenter.resourceRoots().map((root) => root.label)).toEqual(['~/shop/locales']);
        expect(presenter.changes()).toEqual({ addResourceRootTokens: ['t1'], removeResourceRoots: [0] });

        // act
        presenter.discard();

        // assert
        expect(presenter.isDirty()).toBe(false);
        expect(presenter.resourceRoots().map((root) => root.label)).toEqual(['i18n']);
    });

    it('says why a folder outside of the project was refused', async () => {
        // arrange
        const { presenter, session } = setUp(SettingsProjectViewPresenter, OPEN, PROJECT, { 'dialog.chooseFolder': new Error('Choose a folder inside the project.') });

        await session.refresh();
        await presenter.load();

        // act
        await presenter.chooseSourceRoot();

        // assert
        expect(presenter.message()).toBe('Choose a folder inside the project.');
        expect(presenter.isDirty()).toBe(false);
    });

    it('refuses something that is no locale', async () => {
        // arrange
        const { presenter, session } = setUp(SettingsProjectViewPresenter, OPEN, PROJECT);

        await session.refresh();
        await presenter.load();

        // act
        presenter.entriesForm.targetLocales().value.set('not a locale');
        presenter.addEntry('targetLocales');

        // assert
        expect(presenter.message()).toContain('is no locale');
        expect(presenter.targetLocales()).toEqual(['en']);
    });
});

describe('SettingsWorkspaceViewPresenter saving', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('saves the values into the profile and enables Save only when dirty', async () => {
        // arrange
        const { presenter, session, request } = setUp(SettingsWorkspaceViewPresenter, OPEN, WORKSPACE);

        await session.refresh();
        await presenter.load();

        // assert
        expect(presenter.isDirty()).toBe(false);
        expect(presenter.canSave()).toBe(false);

        // act
        presenter.form.name().value.set('Acme two');
        presenter.pickColor('blue');
        presenter.form.targetLocales().value.set('de, fr');

        // assert
        expect(presenter.canSave()).toBe(true);

        // act
        await presenter.save();

        // assert
        expect(request).toHaveBeenCalledWith('workspace.update', {
            workspaceId: 'w1',
            name: 'Acme two',
            code: 'AC',
            color: 'blue',
            scanForProjects: true,
            defaults: { baseLocale: 'en', targetLocales: ['de', 'fr'], preset: 'angular' },
            removeRepositories: [],
            addRepositoryTokens: []
        });
    });

    it('refuses a short code that is none', async () => {
        // arrange
        const { presenter, session } = setUp(SettingsWorkspaceViewPresenter, OPEN, WORKSPACE);

        await session.refresh();
        await presenter.load();

        // act
        presenter.form.code().value.set('long code');

        // assert
        expect(presenter.codeError()).not.toBeNull();
        expect(presenter.canSave()).toBe(false);
    });

    it('asks before a workspace goes', async () => {
        // arrange
        const { presenter, session, request } = setUp(SettingsWorkspaceViewPresenter, OPEN, WORKSPACE);

        await session.refresh();
        await presenter.load();

        // act
        presenter.askRemove();

        // assert
        expect(presenter.confirmingRemove()).toBe(true);
        expect(request).not.toHaveBeenCalledWith('workspace.remove', expect.anything());

        // act
        await presenter.remove();

        // assert
        expect(request).toHaveBeenCalledWith('workspace.remove', { workspaceId: 'w1' });
    });
});
