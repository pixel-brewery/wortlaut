// #region Imports

import { TestBed } from '@angular/core/testing';
import type { ProjectSummary, RunSummary } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLocale, describeNextStep, describeRule, OverviewViewPresenter } from './OverviewViewPresenter';

// #endregion

const SUMMARY: ProjectSummary = {
    name: 'shop',
    resourceRoot: 'libs/intl/i18n',
    format: 'json',
    preset: 'angular',
    hasCatalogs: true,
    sourceRoot: 'apps/web/src',
    baseLocale: 'en',
    keyCount: 858,
    catalogCount: 1,
    namespaceCount: 26,
    translatedShare: 851 / 858,
    translatedCount: 851,
    translatableCount: 858,
    analysis: null,
    nextSteps: [],
    locales: [
        { code: 'en', isBase: true, file: 'lang.en.json', total: 858, translated: 858, identical: 0, missing: 0 },
        { code: 'de', isBase: false, file: 'lang.de.json', total: 858, translated: 851, identical: 7, missing: 0 }
    ],
    namespaces: [{ name: 'error', count: 178 }, { name: 'common', count: 89 }],
    moreNamespaces: { name: '18 more', count: 250 }
};

const RUN: RunSummary = { id: 'r1', title: 'analyze', command: 'analyze', state: 'succeeded', surface: 'cli', dryRun: true, forReview: false, canRepeat: true, startedAt: new Date().toISOString(), detail: 'x', failedRules: 0 };

function setUp(summary: ProjectSummary | Error = SUMMARY) {
    const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
        switch (method) {
            case 'project.summary':
                return summary instanceof Error ? Promise.reject(summary) : Promise.resolve(summary);
            case 'run.list':
                return Promise.resolve([RUN]);
            default:
                return Promise.resolve({ workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true });
        }
    });

    TestBed.configureTestingModule({ providers: [OverviewViewPresenter, { provide: DesktopApi, useValue: { request } }] });

    return { presenter: TestBed.inject(OverviewViewPresenter), session: TestBed.inject(ShellSession), request };
}

describe('describeNextStep', () => {
    it('writes each kind of step with its action', () => {
        expect(describeNextStep({ kind: 'identical-values', count: 7 })).toMatchObject({ title: 'Review 7 identical values', action: 'Open findings', route: '/analyze' });
        expect(describeNextStep({ kind: 'unused-keys', count: 1 })).toMatchObject({ title: 'Clean up 1 unused key', action: 'Test patterns', route: '/test-lab/patterns' });
        expect(describeNextStep({ kind: 'missing-locale', locale: 'fr', keys: 858, chunks: 86 })).toEqual({
            title: 'Add French',
            text: '858 keys in 86 chunks with the current settings. You review before anything is written.',
            action: 'Set up translation',
            route: '/generate'
        });
    });
});

describe('describeLocale', () => {
    const base = { code: 'de', isBase: false, file: 'lang.de.json', total: 10, translated: 10, identical: 0, missing: 0 };

    it('states what a locale really has', () => {
        expect(describeLocale({ ...base, code: 'en', isBase: true })).toMatchObject({ name: 'English', count: 'Base', state: 'Base locale', variant: 'neutral', done: 10 });
        expect(describeLocale(base)).toMatchObject({ name: 'German', count: '10 of 10', state: 'Complete', variant: 'success' });
        expect(describeLocale({ ...base, translated: 7, identical: 3 })).toMatchObject({ count: '7 of 10', state: '3 identical', variant: 'warning', done: 7 });
        expect(describeLocale({ ...base, translated: 8, missing: 2 })).toMatchObject({ state: '2 missing', variant: 'warning' });
    });

    it('says when a locale has no file yet', () => {
        expect(describeLocale({ ...base, file: null, translated: 0, missing: 10 })).toMatchObject({ file: 'Not created', count: '0 of 10', state: 'Not started', variant: 'neutral', done: 0 });
    });
});

describe('describeRule', () => {
    it('writes the result of a rule per locale', () => {
        expect(describeRule({ id: 'a', passed: true, locales: [] })).toEqual({ id: 'a', passed: true, result: 'Pass', detail: 'Pass', resultLocale: null });
        expect(describeRule({ id: 'a', passed: false, locales: [{ locale: 'en', count: 22 }, { locale: 'de', count: 16 }] })).toMatchObject({ result: 'en 22 +1', detail: 'en 22 · de 16', resultLocale: 'en' });
        expect(describeRule({ id: 'a', passed: false, locales: [{ locale: 'de', count: null }] }).result).toBe('de');
        expect(describeRule({ id: 'a', passed: false, locales: [] }).result).toBe('Failed');
    });
});

describe('OverviewViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('fails plainly without an open project', async () => {
        const { presenter } = setUp();

        await presenter.load();

        expect(presenter.summary.error()).toBe('No project is open.');
    });

    it('says Not analyzed before the first analysis instead of a number', async () => {
        const { presenter, session } = setUp();

        await session.refresh();
        await presenter.load();

        expect(presenter.figures()).toEqual([
            { label: 'Keys', value: '858', note: '26 namespaces in 1 catalog' },
            { label: 'Translated', value: '99.2%', note: '851 German values differ from English' },
            { label: 'Failing rules', value: 'Not analyzed', note: 'Run an analysis to see the results' },
            { label: 'Unused keys', value: 'Not analyzed', note: 'Needs an analysis with a source root' }
        ]);
        expect(presenter.rulesNote()).toBe('Not analyzed');
        expect(presenter.rules()).toEqual([]);
    });

    it('shows the results of the last analysis', async () => {
        const { presenter, session } = setUp({
            ...SUMMARY,
            analysis: {
                runId: 'r1',
                finishedAt: new Date().toISOString(),
                failingRules: 2,
                unusedKeys: 215,
                rules: [
                    { id: 'empty-values', passed: true, locales: [] },
                    { id: 'unused-keys', passed: false, locales: [{ locale: 'en', count: 215 }] },
                    { id: 'missing-translations', passed: false, locales: [{ locale: 'de', count: 7 }] }
                ]
            }
        });

        await session.refresh();
        await presenter.load();

        expect(presenter.figures()[2]).toEqual({ label: 'Failing rules', value: '2 of 3', note: 'unused-keys, missing-translations' });
        expect(presenter.figures()[3]).toEqual({ label: 'Unused keys', value: '215', note: 'No source below apps/web/src uses them' });
        expect(presenter.rulesNote()).toBe('1 of 3 pass');
        expect(presenter.rules()[1]).toEqual({ id: 'unused-keys', passed: false, result: 'en 215', detail: 'en 215', resultLocale: 'en' });
    });

    it('says when no rule fails and no key is unused', async () => {
        const { presenter, session } = setUp({ ...SUMMARY, analysis: { runId: 'r1', finishedAt: new Date().toISOString(), failingRules: 0, unusedKeys: 0, rules: [{ id: 'a', passed: true, locales: [] }] } });

        await session.refresh();
        await presenter.load();

        expect(presenter.figures()[2]).toEqual({ label: 'Failing rules', value: '0 of 1', note: 'Every rule passes' });
        expect(presenter.figures()[3].note).toBe('Every key is used');
    });

    it('shows a dash when no target locale has a catalog', async () => {
        const { presenter, session } = setUp({ ...SUMMARY, translatedShare: null, locales: [SUMMARY.locales[0]] });

        await session.refresh();
        await presenter.load();

        expect(presenter.figures()[1]).toEqual({ label: 'Translated', value: '–', note: 'No target locale has a catalog yet' });
    });

    it('draws the bars against the largest namespace, with the rest last', async () => {
        const { presenter, session } = setUp();

        await session.refresh();
        await presenter.load();

        expect(presenter.namespaces().map((namespace) => [namespace.name, namespace.width])).toEqual([['error', '71%'], ['common', '36%'], ['18 more', '100%']]);
    });

    it('asks for the last three runs and writes how each happened', async () => {
        const { presenter, session, request } = setUp();

        await session.refresh();
        await presenter.load();

        expect(request).toHaveBeenCalledWith('run.list', { projectId: 'p1', limit: 3 });
        expect(presenter.whenOf(RUN)).toBe('Dry run · Just now');
    });

    it('shows the true failure of the summary', async () => {
        const { presenter, session } = setUp(new Error('The path i18n is not a valid directory.'));

        await session.refresh();
        await presenter.load();

        expect(presenter.summary.isFailed()).toBe(true);
        expect(presenter.summary.error()).toBe('The path i18n is not a valid directory.');
        expect(presenter.figures()).toEqual([]);
    });
});
