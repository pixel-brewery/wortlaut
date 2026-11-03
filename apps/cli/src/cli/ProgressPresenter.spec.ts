// #region Imports

import { logProgress, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressPresenter } from './ProgressPresenter';

vi.mock('@pixel-brewery/utilities', async (importOriginal) => ({
    ...await importOriginal<typeof import('@pixel-brewery/utilities')>(),
    logProgress: vi.fn(() => ({ report: vi.fn(), dispose: vi.fn() }))
}));

// #endregion

describe('ProgressPresenter', () => {
    afterEach(() => {
        vi.mocked(logProgress).mockClear();
    });

    it('shows one bar per locale and ends the previous one', () => {
        // arrange
        const presenter = new ProgressPresenter({} as ILogger);

        // act
        presenter.report({ runId: 'r', phase: 'generate', completed: 0, total: 2, detail: 'de' });
        presenter.report({ runId: 'r', phase: 'generate', completed: 1, total: 2, detail: 'de' });
        presenter.report({ runId: 'r', phase: 'generate', completed: 0, total: 3, detail: 'fr' });

        // assert
        const bars = vi.mocked(logProgress).mock.results.map((result) => result.value as { report: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> });

        expect(logProgress).toHaveBeenCalledTimes(2);
        expect(bars[0].report.mock.calls.flat()).toEqual([0, 1]);
        expect(bars[0].dispose).toHaveBeenCalledOnce();
        expect(bars[1].dispose).not.toHaveBeenCalled();
    });

    it('ends the bar of a run that stops early, and does nothing without one', () => {
        // arrange
        const presenter = new ProgressPresenter({} as ILogger);
        presenter.report({ runId: 'r', phase: 'generate', completed: 0, total: 2, detail: 'de' });

        // act
        presenter.dispose();
        presenter.dispose();

        // assert
        const [bar] = vi.mocked(logProgress).mock.results.map((result) => result.value as { dispose: ReturnType<typeof vi.fn> });

        expect(bar.dispose).toHaveBeenCalledOnce();
    });
});
