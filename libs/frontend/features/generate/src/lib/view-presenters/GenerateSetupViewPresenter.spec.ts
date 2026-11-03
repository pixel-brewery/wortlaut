// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AiProvider, GenerateInput, GenerateOverview } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeTarget, GenerateSetupViewPresenter } from './GenerateSetupViewPresenter';

// #endregion

const PROVIDERS: Array<AiProvider> = [
    { id: 'claude-code', name: 'Claude Code', kind: 'local', state: 'signed-out', description: 'Found on this computer · not signed in' },
    { id: 'codex', name: 'Codex', kind: 'local', state: 'not-installed', description: 'Not installed' },
    { id: 'opencode', name: 'OpenCode', kind: 'local', state: 'ready', description: 'Found on this computer · signed in' },
    { id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: 'With your API key.' }
];

const OVERVIEW: GenerateOverview = {
    baseLocale: 'en',
    format: 'json',
    keyCount: 12,
    targets: [{ locale: 'de', isNew: false, missing: 1, identical: 7, selected: true }, { locale: 'fr', isNew: true, missing: 12, identical: 0, selected: false }],
    namespaces: [{ name: 'capture', path: 'loc.capture', count: 4 }],
    defaults: {
        defaultProvider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        chunkSize: 5,
        limit: null,
        instructions: 'Keep Wortlaut.',
        localeInstructions: {},
        safety: { reviewBeforeWriting: true, protectPlaceholders: true, keepPartialResults: true, keepRawOutput: false },
        locales: ['de', 'fr'],
        sourceFile: 'wortlaut.config.json'
    },
    activeRunId: null,
    latestRunId: null
};

/**
 * @private
 */
function setUp(overview = OVERVIEW) {
    const navigate = vi.fn(() => Promise.resolve(true));
    const request = vi.fn((method: string, payload: { input?: GenerateInput }): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'generate.overview':
                return Promise.resolve(overview);
            case 'ai.providers':
                return Promise.resolve(PROVIDERS);
            case 'ai.models':
                return Promise.resolve({ models: ['gpt-4o-mini', 'gpt-4o'] });
            case 'generate.estimate':
                return Promise.resolve({ keys: payload.input?.limit ?? 12, chunks: 3, estimatedTokens: 2400, tokensAreLowerBound: false, tokensNote: 'A rough figure.' });
            case 'generate.prompt':
                return Promise.resolve({ text: 'The prompt' });
            case 'generate.command':
                return Promise.resolve({ command: 'npx wortlaut generate', shown: 'npx wortlaut generate' });
            case 'run.active':
                return Promise.resolve([]);
            case 'run.start':
                return Promise.resolve({ id: 'run1', command: 'generate', projectId: 'p1', projectName: 'shop', title: 'generate', startedAt: new Date().toISOString(), dryRun: true, phase: 'Starting', completed: 0, total: 0, detail: null, batch: null, log: [] });
            case 'generate.addLocale':
                return Promise.resolve({ state: 'pending', changeSetId: 'c1', runId: 'r1', files: [] });
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({
        providers: [
            GenerateSetupViewPresenter,
            { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
            { provide: Router, useValue: { navigate } }
        ]
    });

    return { presenter: TestBed.inject(GenerateSetupViewPresenter), session: TestBed.inject(ShellSession), handoff: TestBed.inject(AiHandoff), request, navigate };
}

/**
 * @private
 */
async function loaded() {
    const context = setUp();

    await context.session.refresh();
    await context.presenter.load();
    TestBed.tick();

    return context;
}

describe('describeTarget', () => {
    it('says how far a locale is', () => {
        expect(describeTarget(OVERVIEW.targets[0], 'English')).toBe('1 missing, 7 identical to English');
        expect(describeTarget(OVERVIEW.targets[1], 'English')).toBe('New locale');
        expect(describeTarget({ locale: 'de', isNew: false, missing: 0, identical: 0, selected: true }, 'English')).toBe('Complete');
    });
});

describe('GenerateSetupViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('starts from the defaults of the project, with the true state of every provider', async () => {
        // act
        const { presenter } = await loaded();

        // assert
        expect(presenter.provider()?.id).toBe('openai');
        expect(presenter.temperatureText()).toBe('0.3');
        expect(presenter.form.chunk().value()).toBe('5');
        expect(presenter.form.instructions().value()).toBe('Keep Wortlaut.');
        expect(presenter.targets().map((target) => [target.code, target.isChecked])).toEqual([['de', true], ['fr', false]]);
        expect(presenter.providerChoices().map((provider) => provider.state2)).toEqual(['Not signed in', 'Not installed', 'Local login, no API key', 'API key saved']);
    });

    it('asks main for the estimate, labels it, and updates it on every change', async () => {
        // arrange
        const { presenter, request } = await loaded();

        presenter.form.limit().value.set('3');
        TestBed.tick();

        // act
        await vi.waitFor(() => expect(presenter.estimate.value()?.keys).toBe(3));

        // assert
        expect(presenter.summary().map((row) => [row.label, row.value])).toEqual([['Locales', 'German'], ['Keys', '3'], ['Chunks', '3'], ['Estimated tokens', '≈ 2 k']]);
        expect(request).toHaveBeenCalledWith('generate.command', expect.objectContaining({ input: expect.objectContaining({ limit: 3 }) }));
    });

    it('blocks a run without a locale or with a provider that is not set up, and says why', async () => {
        // arrange
        const { presenter } = await loaded();

        // act & assert
        presenter.setTarget('de', false);
        expect(presenter.blocker()).toBe('Choose a target locale.');
        expect(presenter.canStart()).toBe(false);

        presenter.setTarget('de', true);
        presenter.pickProvider('claude-code');
        expect(presenter.blocker()).toContain('Claude Code is not set up: Not signed in');

        presenter.pickProvider('codex');
        expect(presenter.blocker()).toContain('Not installed');

        presenter.pickProvider('opencode');
        expect(presenter.blocker()).toBeNull();
    });

    it('refuses a limit or a chunk size that makes no sense', async () => {
        // arrange
        const { presenter } = await loaded();

        // act & assert
        presenter.form.limit().value.set('many');
        expect(presenter.limitError()).not.toBeNull();
        expect(presenter.canStart()).toBe(false);

        presenter.form.limit().value.set('');
        presenter.form.chunk().value.set('101');
        expect(presenter.chunkError()).not.toBeNull();
        expect(presenter.canStart()).toBe(false);
    });

    it('starts the run in main, with no model for a local assistant, and opens its view', async () => {
        // arrange
        const { presenter, request, navigate } = await loaded();

        presenter.pickProvider('opencode');
        presenter.pickChoice('namespace');
        TestBed.tick();

        // act
        await presenter.start();

        // assert
        expect(request).toHaveBeenCalledWith('run.start', {
            command: 'generate',
            projectId: 'p1',
            input: expect.objectContaining({ provider: 'opencode', model: '', locales: ['de'], namespace: 'loc.capture', scope: 'all', chunkSize: 5, keys: null })
        });
        expect(navigate).toHaveBeenCalledWith(['/generate/runs', 'run1']);
    });

    it('takes the scope for the keys Analyze handed over', async () => {
        // arrange
        const context = setUp();

        await context.session.refresh();
        context.handoff.offerGenerate({ keys: ['loc.a', 'loc.b'] });

        // act
        await context.presenter.load();
        await context.presenter.start();

        // assert
        expect(context.presenter.seededKeys()).toBe(2);
        expect(context.request).toHaveBeenCalledWith('run.start', expect.objectContaining({ input: expect.objectContaining({ keys: ['loc.a', 'loc.b'], scope: 'all' }) }));
    });

    it('hands the setup to the test lab', async () => {
        // arrange
        const { presenter, handoff, navigate } = await loaded();

        // act
        await presenter.testFirst();

        // assert
        expect(handoff.takeTest()).toMatchObject({ size: 10, input: { locales: ['de'], provider: 'openai' } });
        expect(navigate).toHaveBeenCalledWith(['/test-lab/translation']);
    });

    it('adds a validated locale as a change set, and selects it', async () => {
        // arrange
        const { presenter, request } = await loaded();

        presenter.openAddLocale();

        // act
        presenter.form.newLocale().value.set('not a locale');
        expect(presenter.canAddLocale()).toBe(false);
        presenter.form.newLocale().value.set('pt-BR');
        await presenter.addLocale();

        // assert
        expect(request).toHaveBeenCalledWith('generate.addLocale', { projectId: 'p1', locale: 'pt-BR' });
        expect(presenter.targets().at(-1)).toMatchObject({ code: 'pt-BR', state: 'New locale', isChecked: true });
        expect(presenter.addingLocale()).toBe(false);
    });
});
