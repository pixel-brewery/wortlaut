// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AiProvider, IpcEvent, TestTranslation } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeSetupResult, TestTranslationViewPresenter } from './TestTranslationViewPresenter';

// #endregion

const PROVIDERS: Array<AiProvider> = [
    { id: 'claude-code', name: 'Claude Code', kind: 'local', state: 'ready', description: '' },
    { id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: '' }
];

const RESULT: TestTranslation = {
    id: 't1',
    isRunning: false,
    locale: 'fr',
    rows: [{ key: 'loc.a', base: 'Hello {0}' }],
    setups: [
        { name: 'A', provider: 'claude-code', providerName: 'Claude Code', model: '', temperature: 0.7, status: 'done', durationMs: 1200, estimatedTokens: null, issues: 0, failure: null, results: [{ key: 'loc.a', value: 'Bonjour {0}', note: null }] },
        { name: 'B', provider: 'openai', providerName: 'OpenAI', model: 'gpt-4o-mini', temperature: 0.7, status: 'failed', durationMs: 300, estimatedTokens: null, issues: 0, failure: 'No key', results: [] }
    ]
};

/**
 * @private
 */
function setUp() {
    let listener: ((event: IpcEvent) => void) | null = null;
    const navigate = vi.fn(() => Promise.resolve(true));
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: null, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'test.sample':
                return Promise.resolve({ baseLocale: 'en', locales: ['fr'], namespaces: [{ name: 'a', path: 'loc.a', count: 1 }], rows: [{ key: 'loc.a', base: 'Hello {0}', comment: 'Greeting' }], instructions: 'Keep it short.' });
            case 'ai.providers':
                return Promise.resolve(PROVIDERS);
            case 'test.translation':
                return Promise.resolve(null);
            case 'test.translate':
                return Promise.resolve(RESULT);
            default:
                return Promise.resolve({});
        }
    });

    TestBed.configureTestingModule({
        providers: [
            TestTranslationViewPresenter,
            { provide: DesktopApi, useValue: { request, onEvent: (handler: (event: IpcEvent) => void) => {
                listener = handler;

                return () => undefined;
            } } },
            { provide: Router, useValue: { navigate } }
        ]
    });

    return { presenter: TestBed.inject(TestTranslationViewPresenter), session: TestBed.inject(ShellSession), handoff: TestBed.inject(AiHandoff), request, navigate, emit: (event: IpcEvent) => listener?.(event) };
}

/**
 * @private
 */
async function loaded() {
    const context = setUp();

    await context.session.refresh();
    await context.presenter.load();

    return context;
}

describe('describeSetupResult', () => {
    it('labels the tokens as an estimate, and shows a dash when they are unknown', () => {
        expect(describeSetupResult({ ...RESULT.setups[0], estimatedTokens: 412, issues: 1 })).toBe('1.2 s · ≈ 412 tokens · 1 issue');
        expect(describeSetupResult(RESULT.setups[0])).toBe('1.2 s · – tokens · 0 issues');
        expect(describeSetupResult(RESULT.setups[1])).toBe('Failed');
        expect(describeSetupResult(undefined)).toBe('Not run yet');
    });
});

describe('TestTranslationViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('starts from a sample of real keys with two setups', async () => {
        // act
        const { presenter } = await loaded();

        // assert
        expect(presenter.sampleText()).toBe('1 keys, English to French');
        expect(presenter.setups().map((entry) => [entry.name, entry.setup.provider, entry.isKey])).toEqual([['A', 'claude-code', false], ['B', 'openai', true]]);
        expect(presenter.runLabel()).toBe('Run');
    });

    it('compares both setups through main and shows a failure in its own column', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        await presenter.run();

        // assert
        expect(request).toHaveBeenCalledWith('test.translate', expect.objectContaining({ locale: 'fr', rows: [{ key: 'loc.a', base: 'Hello {0}', comment: 'Greeting' }], instructions: 'Keep it short.' }));
        expect(presenter.rows()).toEqual([{ key: 'loc.a', base: 'Hello {0}', a: { value: 'Bonjour {0}', note: null }, b: { value: '–', note: null } }]);
        expect(presenter.setups()[1].failure).toBe('No key');
        expect(presenter.runLabel()).toBe('Run again');
    });

    it('adds a text to this sample only', async () => {
        // arrange
        const { presenter, request } = await loaded();

        presenter.form.text().value.set('Your recording is saved.');

        // act
        presenter.addText();
        await presenter.run();

        // assert
        expect(request).toHaveBeenCalledWith('test.translate', expect.objectContaining({ rows: expect.arrayContaining([{ key: 'own.text1', base: 'Your recording is saved.', comment: '' }]) }));
        expect(presenter.form.text().value()).toBe('');
    });

    it('never asks for a change set or a write', async () => {
        // arrange
        const { presenter, request } = await loaded();

        // act
        await presenter.run();

        // assert
        expect(request.mock.calls.map(([method]) => method).filter((method) => (/changes|catalog\.set|generate\.write|config/).test(method))).toEqual([]);
    });

    it('starts from the setup Generate handed over', async () => {
        // arrange
        const context = setUp();

        await context.session.refresh();
        context.handoff.offerTest({ size: 10, input: { locales: ['fr'], scope: 'all', namespace: 'loc.a', keys: null, limit: null, provider: 'openai', model: 'gpt-4o', temperature: 0.2, chunkSize: 5, instructions: 'Use tu.', reviewBeforeWriting: true, protectPlaceholders: true } });

        // act
        await context.presenter.load();

        // assert
        expect(context.request).toHaveBeenCalledWith('test.sample', { projectId: 'p1', namespace: 'loc.a', size: 10 });
        expect(context.presenter.setups()[0].setup).toEqual({ provider: 'openai', model: 'gpt-4o', temperature: 0.2 });
    });

    it('goes to Generate with the chosen setup', async () => {
        // arrange
        const { presenter, handoff, navigate } = await loaded();

        // act
        await presenter.useSetup(1);

        // assert
        expect(handoff.takeGenerate()?.input).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', locales: ['fr'] });
        expect(navigate).toHaveBeenCalledWith(['/generate']);
    });
});
