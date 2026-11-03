// #region Imports

import { TestBed } from '@angular/core/testing';
import type { CatalogKeyDetail, CatalogOverview } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flagsOf, TranslationsViewPresenter } from './TranslationsViewPresenter';

// #endregion

const OVERVIEW: CatalogOverview = {
    prefix: 'loc',
    baseLocale: 'en',
    locales: [{ code: 'en', file: 'lang.en.json' }, { code: 'de', file: 'lang.de.json' }, { code: 'fr', file: null }],
    format: 'json',
    commentsSupported: false,
    keyCount: 2,
    fileCount: 2,
    namespaces: Array.from({ length: 15 }, (_item, index) => ({ name: `ns${index}`, count: 2 }))
};

const DETAIL: CatalogKeyDetail = { key: 'loc.a', base: 'Hello {0}', target: 'Hallo {0}', comment: null, findings: [], usages: [{ file: 'src/a.ts', line: 3 }] };

function setUp(save: 'applied' | 'pending' = 'pending') {
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'ai.providers':
                return Promise.resolve([{ id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: '' }]);
            case 'ai.suggestValue':
                return Promise.resolve({ value: 'Bonjour {0}', providerName: 'OpenAI', problem: null });
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'catalog.overview':
                return Promise.resolve(OVERVIEW);
            case 'catalog.keys':
                return Promise.resolve({ rows: [{ key: 'loc.a', flags: ['placeholder'], base: 'Hello {0}', target: 'Hallo {0}' }], matching: 1, total: 2 });
            case 'catalog.keyDetail':
                return Promise.resolve(DETAIL);
            case 'catalog.setValue':
            case 'catalog.addLocale':
                return Promise.resolve({ state: save, changeSetId: 'c1', runId: 'r1', files: ['lang.de.json'] });
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({ providers: [TranslationsViewPresenter, { provide: DesktopApi, useValue: { request } }] });

    return { presenter: TestBed.inject(TranslationsViewPresenter), session: TestBed.inject(ShellSession), request };
}

async function loaded(save: 'applied' | 'pending' = 'pending') {
    const context = setUp(save);

    await context.session.refresh();
    await context.presenter.load();
    await vi.waitFor(() => {
        TestBed.tick();
        expect(context.presenter.detail.value()).not.toBeNull();
    });

    return context;
}

describe('flagsOf', () => {
    it('writes the flags as badges, with the placeholder of the value', () => {
        expect(flagsOf({ flags: ['duplicate', 'unused', 'placeholder'], base: 'At {0} now' }).map((badge) => badge.label)).toEqual(['Duplicate', 'Unused', '{0}']);
    });
});

describe('TranslationsViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('picks the first target locale with a catalog and the first key', async () => {
        // act
        const { presenter } = await loaded();

        // assert
        expect(presenter.target()).toBe('de');
        expect(presenter.selectedKey()).toBe('loc.a');
        expect(presenter.editorForm.value().value()).toBe('Hallo {0}');
        expect(presenter.keysHeader()).toBe('1 of 2 keys');
    });

    it('shows thirteen namespaces, then N more', async () => {
        // act
        const { presenter } = await loaded();

        // assert
        expect(presenter.namespaces()).toHaveLength(13);
        expect(presenter.moreNamespaces()).toEqual({ label: '2 more', count: '4' });

        // act
        presenter.showAllNamespaces();

        // assert
        expect(presenter.namespaces()).toHaveLength(15);
        expect(presenter.moreNamespaces()).toBeNull();
    });

    it('shows Save only when dirty, and Revert goes back', async () => {
        // arrange
        const { presenter } = await loaded();

        expect(presenter.isDirty()).toBe(false);

        // act
        presenter.editorForm.value().value.set('Servus');

        // assert
        expect(presenter.isDirty()).toBe(true);

        // act
        presenter.revert();

        // assert
        expect(presenter.isDirty()).toBe(false);
    });

    it('saves a value as a change set for that catalog, which waits in Review while dry run is on', async () => {
        // arrange
        const { presenter, request } = await loaded('pending');

        presenter.editorForm.value().value.set('Servus');

        // act
        await presenter.save();

        // assert
        expect(request).toHaveBeenCalledWith('catalog.setValue', { projectId: 'p1', key: 'loc.a', locale: 'de', value: 'Servus' });
        expect(presenter.outcome()?.state).toBe('pending');
        expect(presenter.isDirty()).toBe(false);
    });

    it('asks for a locale tag before it adds a locale', async () => {
        // arrange
        const { presenter, request } = await loaded();

        presenter.openAddLocale();

        // act
        presenter.newLocaleForm.code().value.set('not a tag');

        // assert
        expect(presenter.canAddLocale()).toBe(false);

        // act
        presenter.newLocaleForm.code().value.set('pt-BR');
        await presenter.addLocale();

        // assert
        expect(request).toHaveBeenCalledWith('catalog.addLocale', { projectId: 'p1', locale: 'pt-BR' });
        expect(presenter.addingLocale()).toBe(false);
    });

    it('suggests a value with the unsaved comment, and it stays a proposal until it is applied', async () => {
        // arrange
        const { presenter, request } = await loaded();

        presenter.editorForm.comment().value.set('On the greeting screen');

        // act
        await presenter.suggest();

        // assert
        expect(request).toHaveBeenCalledWith('ai.suggestValue', { requestId: expect.any(String), projectId: 'p1', key: 'loc.a', locale: 'de', comment: 'On the greeting screen' });
        expect(presenter.suggestion()?.value).toBe('Bonjour {0}');
        expect(presenter.suggestionNote()).toBe('OpenAI · placeholders kept');
        expect(presenter.editorForm.value().value()).toBe('Hallo {0}');
        expect(request.mock.calls.map(([method]) => method)).not.toContain('catalog.setValue');
    });

    it('fills the editor on Apply and saves nothing, and goes back on Discard', async () => {
        // arrange
        const { presenter, request } = await loaded();

        await presenter.suggest();

        // act
        presenter.applySuggestion();

        // assert
        expect(presenter.editorForm.value().value()).toBe('Bonjour {0}');
        expect(presenter.isDirty()).toBe(true);
        expect(request.mock.calls.map(([method]) => method)).not.toContain('catalog.setValue');

        await presenter.suggest();
        presenter.discardSuggestion();
        expect(presenter.suggestion()).toBeNull();
    });
});
