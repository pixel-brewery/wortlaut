// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { TestPreset } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestDetectorViewPresenter } from './TestDetectorViewPresenter';
import { TestPatternsViewPresenter } from './TestPatternsViewPresenter';

// #endregion

const PRESETS: Array<TestPreset> = [
    { id: 'angular', name: 'Angular', samples: [{ fileName: 'panel.html', content: 'first\nsecond' }, { fileName: 'panel.ts', content: 'third' }] },
    { id: 'lit', name: 'Lit', samples: [{ fileName: 'panel.ts', content: 'lit' }] }
];

function setUp(navigate = vi.fn(() => Promise.resolve(true))) {
    const request = vi.fn((method: string, payload: { pattern?: string; content?: string }): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'test.presets':
                return Promise.resolve(PRESETS);
            case 'test.detect':
                return Promise.resolve({ detector: 'AngularHTMLDetector', prefix: 'loc', matches: payload.content?.startsWith('first') ? [{ line: 2, column: 1, value: 'second', isHardCoded: true }] : [], resource: '{}', failure: null });
            case 'test.pattern':
                return Promise.resolve(payload.pattern === '{a'
                    ? { error: 'The entry is invalid', matchCount: 0, total: 2, keys: [{ key: 'loc.a', isMatch: false }, { key: 'loc.b', isMatch: false }] }
                    : { error: null, matchCount: 1, total: 2, keys: [{ key: 'loc.a', isMatch: true }, { key: 'loc.b', isMatch: false }] });
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({ providers: [TestDetectorViewPresenter, TestPatternsViewPresenter, { provide: DesktopApi, useValue: { request } }, { provide: Router, useValue: { navigate } }] });

    return { session: TestBed.inject(ShellSession), request };
}

describe('TestDetectorViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('derives its samples from the preset and marks the lines that hold a match', async () => {
        // arrange
        const { session } = setUp();

        await session.refresh();

        const presenter = TestBed.inject(TestDetectorViewPresenter);

        // act
        await presenter.load();

        // assert
        expect(presenter.sampleTabs().map((tab) => tab.fileName)).toEqual(['panel.html', 'panel.ts']);
        expect(presenter.lines().map((line) => line.isMatch)).toEqual([false, true]);
        expect(presenter.matches()[0]).toMatchObject({ position: 'Line 2, column 1', type: 'Hard-coded' });
        expect(presenter.matchesTitle()).toBe('1 match');

        // act
        presenter.pickPreset('lit');

        // assert
        expect(presenter.sampleTabs().map((tab) => tab.fileName)).toEqual(['panel.ts']);
        expect(presenter.content()).toBe('lit');
    });

    it('replaces the sample with the code the user pastes, and reads it with the real detector', async () => {
        // arrange
        const { session, request } = setUp();

        await session.refresh();

        const presenter = TestBed.inject(TestDetectorViewPresenter);

        await presenter.load();

        // act
        presenter.startPasting();
        presenter.pasteForm.text().value.set('my code');
        await presenter.result.reload();

        // assert
        expect(presenter.content()).toBe('my code');
        expect(request).toHaveBeenLastCalledWith('test.detect', expect.objectContaining({ content: 'my code', preset: 'angular', fileName: 'panel.html' }));
    });
});

describe('TestPatternsViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('explains an invalid pattern and offers nothing to add', async () => {
        // arrange
        const { session } = setUp();

        await session.refresh();

        const presenter = TestBed.inject(TestPatternsViewPresenter);

        // act
        presenter.useExample('{a');
        await presenter.result.reload();

        // assert
        expect(presenter.error()).toBe('The entry is invalid');
        expect(presenter.canAdd()).toBe(false);
    });

    it('counts what a pattern covers on real keys, with the grammar of the list', async () => {
        // arrange
        const { session, request } = setUp();

        await session.refresh();

        const presenter = TestBed.inject(TestPatternsViewPresenter);

        // act
        presenter.setList('identicalKeys');
        presenter.useExample('loc.*');
        await presenter.result.reload();

        // assert
        expect(presenter.title()).toBe('1 of 2 keys match');
        expect(request).toHaveBeenLastCalledWith('test.pattern', { projectId: 'p1', pattern: 'loc.*', list: 'identicalKeys' });
    });

    it('only prepares a change in Analyze and writes nothing', async () => {
        // arrange
        const navigate = vi.fn(() => Promise.resolve(true));
        const { session, request } = setUp(navigate);

        await session.refresh();

        const presenter = TestBed.inject(TestPatternsViewPresenter);

        presenter.useExample('loc.*');

        // act
        await presenter.add('usedKeys');

        // assert
        expect(navigate).toHaveBeenCalledWith(['/analyze'], { queryParams: { prepare: 'usedKeys', pattern: 'loc.*' } });
        expect(request.mock.calls.map(([method]) => method)).not.toContain('config.addException');
    });
});

describe('a pattern an AI proposed', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('fills the field and stays a proposal', () => {
        // arrange
        setUp();
        TestBed.inject(AiHandoff).offerPattern({ pattern: 'loc.api.*', note: 'OpenAI proposed this pattern.' });

        // act
        const presenter = TestBed.inject(TestPatternsViewPresenter);

        // assert
        expect(presenter.form.pattern().value()).toBe('loc.api.*');
        expect(presenter.proposal()).toBe('OpenAI proposed this pattern.');
    });
});
