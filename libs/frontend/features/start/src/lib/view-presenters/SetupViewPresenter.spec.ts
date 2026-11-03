// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { ProjectInspection } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupViewPresenter } from './SetupViewPresenter';

// #endregion

const TOKEN = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';

const INSPECTION: ProjectInspection = {
    name: 'shop',
    displayPath: '~/shop',
    configuration: null,
    preset: { value: 'angular', evidence: 'Found @angular/core in package.json' },
    sourceRoot: { value: 'src', fileCount: 4, evidence: '4 matching files' },
    prefix: { value: 'loc', evidence: 'All 2 keys start with it' },
    catalogs: [{ folder: 'i18n', files: ['lang.de.json', 'lang.en.json'], keys: 2, format: 'json' }],
    locales: [{ code: 'de', keys: 2 }, { code: 'en', keys: 2 }],
    baseLocale: 'en',
    suggestedLocales: ['fr', 'nl'],
    truncated: false
};

function setUp(options: { query?: Record<string, string>; inspection?: ProjectInspection; workspaces?: Array<unknown>; failInspect?: string } = {}) {
    const query = options.query ?? { folder: TOKEN };
    const navigate = vi.fn(() => Promise.resolve(true));
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'project.inspectFolder':
                return options.failInspect ? Promise.reject(new Error(options.failInspect)) : Promise.resolve(options.inspection ?? INSPECTION);
            case 'workspace.list':
                return Promise.resolve(options.workspaces ?? []);
            case 'ai.providers':
                return Promise.resolve([
                    { id: 'codex', name: 'Codex', kind: 'local', state: 'not-installed', description: 'Not installed' },
                    { id: 'openai', name: 'OpenAI', kind: 'key', state: 'no-key', description: 'No key is set.' }
                ]);
            default:
                return Promise.resolve({ workspaceId: 'w1', projectId: 'p1' });
        }
    });

    TestBed.configureTestingModule({
        providers: [
            SetupViewPresenter,
            { provide: DesktopApi, useValue: { request } },
            { provide: Router, useValue: { navigate } },
            { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map(Object.entries(query)) } } }
        ]
    });

    return { presenter: TestBed.inject(SetupViewPresenter), navigate, request };
}

function registerPayload(request: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return request.mock.calls.find(([method]) => method === 'project.register')?.[1] as Record<string, unknown>;
}

describe('SetupViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('fails plainly without a chosen folder', async () => {
        const { presenter } = setUp({ query: {} });

        await presenter.load();

        expect(presenter.inspection.isFailed()).toBe(true);
        expect(presenter.inspection.error()).toBe('No folder was chosen. Go back and choose one.');
    });

    it('asks main about a token, never about a path', async () => {
        const { presenter, request } = setUp();

        await presenter.load();

        expect(request).toHaveBeenCalledWith('project.inspectFolder', { folderToken: TOKEN, catalogFolderTokens: [], preset: null });
    });

    it('starts on Catalogs with Folder done', async () => {
        const { presenter } = setUp();

        await presenter.load();

        expect(presenter.step()).toBe('catalogs');
        expect(presenter.steps().map((step) => [step.label, step.isDone, step.isCurrent])).toEqual([['Folder', true, false], ['Catalogs', false, true], ['Locales', false, false], ['AI provider', false, false]]);
        expect(presenter.title()).toBe('We found your catalogs');
    });

    it('says so when no catalogs were found, and lets the user continue', async () => {
        const { presenter } = setUp({ inspection: { ...INSPECTION, catalogs: [], locales: [] } });

        await presenter.load();

        expect(presenter.title()).toBe('No catalogs found');
        expect(presenter.canFinish()).toBe(true);
    });

    it('preselects the locales that exist and marks each one', async () => {
        const { presenter } = setUp();

        await presenter.load();

        expect(presenter.localeChoices()).toEqual([
            { code: 'de', name: 'German', note: 'Exists, 2 keys', isChecked: true },
            { code: 'fr', name: 'French', note: 'New', isChecked: false },
            { code: 'nl', name: 'Dutch', note: 'New', isChecked: false }
        ]);
    });

    it('takes the state a chip reports without flipping it', async () => {
        const { presenter } = setUp();

        await presenter.load();

        const before = presenter.localeChoices();

        presenter.setLocale('de', true);
        presenter.setLocale('de', true);
        expect(presenter.localeChoices()).toBe(before);
        expect(presenter.localeChoices()[0].isChecked).toBe(true);

        presenter.setLocale('fr', true);
        presenter.setLocale('de', false);
        expect(presenter.localeChoices().map((choice) => choice.isChecked)).toEqual([false, true, false]);
    });

    it('offers existing workspaces and a new one, preselecting the one it was opened for', async () => {
        const workspaces = [{ id: 'w7', name: 'Acme' }, { id: 'w8', name: 'Other' }];
        const { presenter } = setUp({ query: { folder: TOKEN, workspace: 'w8' }, workspaces });

        await presenter.load();

        expect(presenter.form.workspace().value()).toBe('w8');
        expect(presenter.isNewWorkspace()).toBe(false);
    });

    it('registers into a new workspace without a path in the request', async () => {
        const { presenter, request, navigate } = setUp();

        await presenter.load();
        expect(presenter.isNewWorkspace()).toBe(true);

        presenter.setLocale('fr', true);
        await presenter.finish();

        expect(registerPayload(request)).toEqual({
            folderToken: TOKEN,
            catalogFolderTokens: [],
            workspace: { kind: 'new', name: 'shop', code: 'SH', color: 'teal' },
            preset: 'angular',
            baseLocale: 'en',
            targetLocales: ['de', 'fr']
        });
        expect(navigate).toHaveBeenCalledWith(['/overview']);
    });

    it('registers into an existing workspace', async () => {
        const { presenter, request } = setUp({ workspaces: [{ id: 'w7', name: 'Acme' }] });

        await presenter.load();
        await presenter.finish();

        expect(registerPayload(request).workspace).toEqual({ kind: 'existing', id: 'w7' });
    });

    it('stays with a message when the registration fails', async () => {
        const { presenter, request, navigate } = setUp();

        await presenter.load();
        request.mockImplementation(() => Promise.reject(new Error('The workspace list cannot be read.')));
        await presenter.finish();

        expect(presenter.message()).toBe('The workspace list cannot be read.');
        expect(navigate).not.toHaveBeenCalled();
        expect(presenter.busy()).toBe(false);
    });

    it('cannot finish a new workspace without a usable name', async () => {
        const { presenter, request } = setUp({ inspection: { ...INSPECTION, name: '  ' } });

        await presenter.load();
        presenter.form.newName().value.set(' ');

        expect(presenter.canFinish()).toBe(false);

        await presenter.finish();

        expect(registerPayload(request)).toBeUndefined();
    });

    it('looks at the folder again when another preset is picked', async () => {
        const { presenter, request } = setUp();

        await presenter.load();
        presenter.form.preset().value.set('vue');
        TestBed.tick();

        expect(request).toHaveBeenLastCalledWith('project.inspectFolder', { folderToken: TOKEN, catalogFolderTokens: [], preset: 'vue' });
    });

    it('does not look again for the preset it found itself', async () => {
        const { presenter, request } = setUp();

        await presenter.load();
        TestBed.tick();

        expect(request.mock.calls.filter(([method]) => method === 'project.inspectFolder')).toHaveLength(1);
    });

    it('adds a catalog folder, which main keeps inside the project', async () => {
        const { presenter, request } = setUp();
        const other = '00000000-0000-4000-8000-000000000000';

        await presenter.load();
        request.mockImplementation((method: string) => Promise.resolve(method === 'dialog.chooseFolder' ? { folder: { token: other, displayPath: '~/shop/x', name: 'x' } } : INSPECTION));
        await presenter.addCatalogFolder();

        expect(request).toHaveBeenCalledWith('dialog.chooseFolder', { insideToken: TOKEN });
        expect(request).toHaveBeenLastCalledWith('project.inspectFolder', { folderToken: TOKEN, catalogFolderTokens: [other], preset: null });
    });

    it('shows why a further folder cannot be added', async () => {
        const { presenter, request } = setUp();

        await presenter.load();
        request.mockImplementation(() => Promise.reject(new Error('Choose a folder inside the project.')));
        await presenter.addCatalogFolder();

        expect(presenter.message()).toBe('Choose a folder inside the project.');
    });

    it('moves between the steps, and Back leaves to the screen that chose the folder', async () => {
        const { presenter, navigate } = setUp();

        await presenter.load();
        presenter.next();
        expect(presenter.step()).toBe('locales');
        presenter.next();
        expect(presenter.step()).toBe('ai');
        await presenter.back();
        await presenter.back();
        expect(presenter.step()).toBe('catalogs');
        await presenter.back();
        expect(navigate).toHaveBeenCalledWith(['/welcome']);
    });

    it('goes back to Workspaces when it came from there', async () => {
        const { presenter, navigate } = setUp({ query: { folder: TOKEN, workspace: 'w8' } });

        await presenter.load();
        await presenter.back();

        expect(navigate).toHaveBeenCalledWith(['/workspaces']);
    });

    it('shows the true failure of an inspection', async () => {
        const { presenter } = setUp({ failInspect: 'The file wortlaut.config.json is not valid JSON.' });

        await presenter.load();

        expect(presenter.inspection.error()).toBe('The file wortlaut.config.json is not valid JSON.');
    });

    it('shows the true state of the providers, and a key field for a provider that needs a key', async () => {
        const { presenter } = setUp();

        await presenter.load();
        presenter.pickProvider('codex');

        expect(presenter.providerChoices().map((provider) => [provider.id, provider.note, provider.isChecked])).toEqual([['codex', 'Not installed', true], ['openai', 'No API key', false]]);
        expect(presenter.needsKey()).toBe(false);
        expect(presenter.providerHint()).toContain('starts no login');

        presenter.pickProvider('openai');

        expect(presenter.needsKey()).toBe(true);
        expect(presenter.providerHint()).toBeNull();
    });

    it('sends the key to the keychain and the choice to the profile, and neither into the registration', async () => {
        const { presenter, request } = setUp();

        await presenter.load();
        presenter.pickProvider('openai');
        presenter.typeKey('test-key-not-real');

        await presenter.finish();

        expect(request).toHaveBeenCalledWith('ai.setKey', { providerId: 'openai', key: 'test-key-not-real' });
        expect(request).toHaveBeenCalledWith('ai.setDefaultProvider', { providerId: 'openai' });
        expect(JSON.stringify(registerPayload(request))).not.toContain('test-key-not-real');
    });

    it('leaves AI alone when it is skipped', async () => {
        const { presenter, request } = setUp();

        await presenter.load();
        presenter.pickProvider('openai');
        presenter.typeKey('test-key-not-real');

        await presenter.finish(true);

        expect(request.mock.calls.map(([method]) => method)).not.toContain('ai.setKey');
        expect(request.mock.calls.map(([method]) => method)).not.toContain('ai.setDefaultProvider');
    });
});
