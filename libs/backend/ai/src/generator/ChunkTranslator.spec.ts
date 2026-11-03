// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { isRetryable, translateChunk } from './ChunkTranslator';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy';

// #endregion

const MODELS = [{ key: 'a', value: 'Hello {0}', comment: '' }];
const RESOURCE = { type: 'json', locale: 'en' };

/**
 * @private
 */
function strategyOf(...answers: Array<unknown>): { strategy: IResourceGeneratorStrategy; transcribe: ReturnType<typeof vi.fn> } {
    const transcribe = vi.fn();

    for (const answer of answers) {
        if (answer instanceof Error) {
            transcribe.mockRejectedValueOnce(answer);
        } else {
            transcribe.mockResolvedValueOnce(answer);
        }
    }

    return { strategy: { transcribe } as unknown as IResourceGeneratorStrategy, transcribe };
}

describe('translateChunk', () => {
    it('asks a chunk again within the budget and tells the model why', async () => {
        // arrange
        const { strategy, transcribe } = strategyOf([{ key: 'b', value: 'x' }], [{ key: 'a', value: 'Hallo {0}' }]);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryDelayMs: 0 });

        // assert
        expect(report.status).toBe('done');
        expect(report.attempts).toBe(2);
        expect(report.rows[0].value).toBe('Hallo {0}');
        expect(transcribe.mock.calls[1][2].feedback).toContain('missing or changed');
    });

    it('fails the chunk once the budget is spent, and hands over nothing', async () => {
        // arrange
        const bad = [{ key: 'b', value: 'x' }];
        const { strategy, transcribe } = strategyOf(bad, bad, bad, bad, bad);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryBudget: 2, retryDelayMs: 0 });

        // assert
        expect(transcribe).toHaveBeenCalledTimes(3);
        expect(report.status).toBe('failed');
        expect(report.rows).toEqual([]);
        expect(report.error?.name).toBe('ChunkRejectedError');
    });

    it('keeps a value with wrong placeholders only after the budget, flagged', async () => {
        // arrange
        const wrong = [{ key: 'a', value: 'Hallo' }];
        const { strategy, transcribe } = strategyOf(wrong, wrong);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryBudget: 1, retryDelayMs: 0 });

        // assert
        expect(transcribe).toHaveBeenCalledTimes(2);
        expect(report.status).toBe('done');
        expect(report.rows[0].problem).toBe('Placeholder {0} is missing');
    });

    it('stops asking when a retry helped', async () => {
        // arrange
        const { strategy } = strategyOf([{ key: 'a', value: 'Hallo' }], [{ key: 'a', value: 'Hallo {0}' }]);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryDelayMs: 0 });

        // assert
        expect(report.rows[0].problem).toBeNull();
    });

    it('retries a failure that says it may pass, and spends the budget on it', async () => {
        // arrange
        const limit = Object.assign(new Error('rate limit'), { retryable: true });
        const { strategy, transcribe } = strategyOf(limit, limit, limit);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryDelayMs: 0 });

        // assert
        expect(transcribe).toHaveBeenCalledTimes(3);
        expect(report.status).toBe('failed');
        expect(report.error).toBe(limit);
    });

    it('does not ask again after a failure that will not pass', async () => {
        // arrange
        const rejected = new Error('not signed in');
        const { strategy, transcribe } = strategyOf(rejected);

        // act
        const report = await translateChunk(strategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryDelayMs: 0 });

        // assert
        expect(transcribe).toHaveBeenCalledOnce();
        expect(report.status).toBe('failed');
    });

    it('counts a cancelled call as a stop, not as a failure', async () => {
        // arrange
        const controller = new AbortController();
        const transcribe = vi.fn(() => {
            controller.abort();

            return Promise.reject(new Error('aborted'));
        });

        // act
        const report = await translateChunk({ transcribe } as unknown as IResourceGeneratorStrategy, { resource: RESOURCE, locale: 'de', models: MODELS, signal: controller.signal });

        // assert
        expect(report.status).toBe('stopped');
        expect(report.rows).toEqual([]);
    });

    it('sums the tokens of all attempts', async () => {
        // arrange
        const transcribe = vi.fn((_data: unknown, _locale: string, options: { onUsage: (tokens: number) => void }) => {
            options.onUsage(40);

            return Promise.resolve(transcribe.mock.calls.length === 1 ? [] : [{ key: 'a', value: 'Hallo {0}' }]);
        });

        // act
        const report = await translateChunk({ transcribe } as unknown as IResourceGeneratorStrategy, { resource: RESOURCE, locale: 'de', models: MODELS, retryDelayMs: 0 });

        // assert
        expect(report.tokens).toBe(80);
    });

    it('reads whether a failure may pass through its causes', () => {
        // act & assert
        expect(isRetryable(new Error('x', { cause: { isRetryable: true } }))).toBe(true);
        expect(isRetryable(new Error('x', { cause: { retryable: false, cause: { retryable: true } } }))).toBe(false);
        expect(isRetryable(new Error('x'))).toBe(false);
    });
});
