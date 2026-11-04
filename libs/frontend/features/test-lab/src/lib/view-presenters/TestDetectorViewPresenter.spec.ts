// #region Imports

import { TestBed } from '@angular/core/testing';
import type { TestDetectResult, TestPreset } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestDetectorViewPresenter } from './TestDetectorViewPresenter';

// #endregion

const PRESETS: Array<TestPreset> = [
    { id: 'angular', name: 'Angular', samples: [{ fileName: 'panel.html', content: 'first\nsecond' }, { fileName: 'panel.ts', content: 'third' }] },
    { id: 'lit', name: 'Lit', samples: [{ fileName: 'panel.ts', content: 'lit' }] }
];

function setUp(options: { presets?: Array<TestPreset>; result?: TestDetectResult } = {}) {
    const request = vi.fn((method: string, payload: { content?: string }): Promise<unknown> => {
        switch (method) {
            case 'shell.state':
                return Promise.resolve({ workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' }, project: { id: 'p1', name: 'shop' }, provider: null, dryRun: true, pendingChanges: 0 });
            case 'test.presets':
                return Promise.resolve(options.presets ?? PRESETS);
            case 'test.detect':
                return Promise.resolve(options.result ?? { detector: 'AngularHTMLDetector', prefix: 'loc', matches: payload.content?.startsWith('first') ? [{ line: 2, column: 1, value: 'second', isHardCoded: true }] : [], resource: '{}', failure: null });
            default:
                return Promise.reject(new Error(`Unexpected ${method}`));
        }
    });

    TestBed.configureTestingModule({ providers: [TestDetectorViewPresenter, { provide: DesktopApi, useValue: { request } }] });

    return { session: TestBed.inject(ShellSession), request };
}

function largeSample() {
    const content = Array.from({ length: 251 }, (_entry, index) => `source ${index + 1}`).join('\n');
    const result: TestDetectResult = {
        detector: 'AngularHTMLDetector', prefix: 'loc',
        matches: Array.from({ length: 251 }, (_entry, index) => ({ line: index + 1, column: 1, value: `value ${index + 1}`, isHardCoded: true })),
        resource: '{"loc":{"all":"kept"}}', failure: null
    };
    const presets: Array<TestPreset> = [
        { id: 'angular', name: 'Angular', samples: [{ fileName: 'panel.html', content }, { fileName: 'panel.ts', content }] },
        { id: 'stencil', name: 'Stencil', samples: [{ fileName: 'panel.html', content }] }
    ];

    return { content, result, presets };
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

    it('pages source lines and matches independently without truncating the analysis', async () => {
        // arrange
        const sample = largeSample();
        const { session, request } = setUp(sample);

        await session.refresh();

        const presenter = TestBed.inject(TestDetectorViewPresenter);

        await presenter.load();
        TestBed.tick();

        const asked = request.mock.calls.filter(([method]) => method === 'test.detect').length;

        // assert
        expect(presenter.lines()).toHaveLength(100);
        expect(presenter.matches()).toHaveLength(100);
        expect(presenter.lineCount()).toBe(251);
        expect(presenter.matchesTitle()).toBe('251 matches');

        // act
        presenter.showMoreLines();

        // assert
        expect(presenter.lines()).toHaveLength(200);
        expect(presenter.matches()).toHaveLength(100);
        expect(presenter.lines()[199]).toMatchObject({ number: 200, text: 'source 200', isMatch: true });

        // act
        presenter.showMoreMatches();
        presenter.showMoreMatches();
        presenter.showMoreLines();
        TestBed.tick();

        // assert
        expect(presenter.lines()).toHaveLength(251);
        expect(presenter.matches()).toHaveLength(251);
        expect(presenter.hasMoreLines()).toBe(false);
        expect(presenter.hasMoreMatches()).toBe(false);
        expect(presenter.result.value()?.resource).toBe(sample.result.resource);
        expect(request.mock.calls.filter(([method]) => method === 'test.detect')).toHaveLength(asked);
        expect(request).toHaveBeenCalledWith('test.detect', expect.objectContaining({ content: sample.content }));
    });

    it.each(['sample', 'preset', 'text'] as const)('returns both projections to the first page when the %s changes', async (change) => {
        // arrange
        const sample = largeSample();
        const { session } = setUp(sample);

        await session.refresh();

        const presenter = TestBed.inject(TestDetectorViewPresenter);

        await presenter.load();
        TestBed.tick();
        presenter.showMoreLines();
        presenter.showMoreMatches();

        // act
        if (change === 'sample') {
            presenter.pickSample('panel.ts');
        } else if (change === 'preset') {
            presenter.pickPreset('stencil');
        } else {
            presenter.startPasting();
            presenter.pasteForm.text().value.set(`${sample.content} changed`);
        }

        TestBed.tick();

        // assert
        expect(presenter.lines()).toHaveLength(100);
        expect(presenter.matches()).toHaveLength(100);
        expect(presenter.hasMoreLines()).toBe(true);
        expect(presenter.hasMoreMatches()).toBe(true);
    });
});
