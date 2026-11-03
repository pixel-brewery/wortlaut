// #region Imports

import type { IResourceModel } from '@pixel-brewery/wortlaut-core';
import { validateChunk, type IChunkIssue, type IValidatedRow } from '../validation/ChunkValidator.js';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy.js';

// #endregion

/**
 * How many times a chunk is asked again by default, after the first attempt.
 */
export const DEFAULT_RETRY_BUDGET = 2;

/**
 * The longest wait before another attempt.
 */
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * What a chunk needs to be translated.
 *
 * @public
 */
export interface IChunkRequest {
    resource: { type: string; locale: string; name?: string; path?: string };
    locale: string;
    models: ReadonlyArray<IResourceModel>;
    instructions?: string | ReadonlyArray<string>;
    signal?: AbortSignal;

    /**
     * How many times the chunk may be asked again.
     *
     * @default 2
     */
    retryBudget?: number;

    /**
     * The first wait before asking again, which doubles with every attempt.
     *
     * @default 1000
     */
    retryDelayMs?: number;

    /**
     * Receives the raw answers, for those who keep them.
     */
    onRaw?: (text: string) => void;
}

/**
 * What became of a chunk. A report exists for every chunk, however it ended.
 *
 * @public
 */
export interface IChunkReport {
    status: 'done' | 'failed' | 'stopped';

    /**
     * One row per key when done. Empty otherwise: a bad chunk reaches nobody.
     */
    rows: Array<IValidatedRow>;

    /**
     * What the last attempt found, and why earlier ones were asked again.
     */
    issues: Array<IChunkIssue>;
    attempts: number;

    /**
     * The tokens the provider reported, or `null` when it reports none.
     */
    tokens: number | null;
    error: Error | null;
    durationMs: number;
}

/**
 * The answer of a chunk that the model got wrong within the whole budget.
 *
 * @public
 */
export class ChunkRejectedError extends Error {

    /**
     * Constructs a new instance of the `ChunkRejectedError` class.
     *
     * @public
     * @param message Why the last answer was rejected.
     */
    public constructor(message: string) {
        super(message);
        this.name = 'ChunkRejectedError';
    }

}

/**
 * Translates one chunk: it asks the strategy, checks the answer and asks again within the retry budget. An answer that misses
 * or changes a key fails the chunk once the budget is spent. A row whose placeholders stay wrong is kept and flagged, so a
 * reviewer can correct it. The generator, a hosted run, the test lab and the value suggestion all go through here.
 *
 * @public
 * @param strategy The strategy.
 * @param request The chunk.
 * @returns The report. It never rejects: a failure is a state.
 */
export async function translateChunk(strategy: IResourceGeneratorStrategy, request: IChunkRequest): Promise<IChunkReport> {
    const startedAt = Date.now();
    const budget = request.retryBudget ?? DEFAULT_RETRY_BUDGET;
    const issues = new Array<IChunkIssue>();
    const finish = (status: IChunkReport['status'], rows: Array<IValidatedRow>, error: Error | null): IChunkReport => ({
        status,
        rows,
        issues,
        attempts,
        tokens,
        error,
        durationMs: Date.now() - startedAt
    });
    let attempts = 0;
    let tokens: number | null = null;
    let feedback: string | undefined;

    for (;;) {
        if (request.signal?.aborted) {
            return finish('stopped', [], null);
        }

        attempts++;

        const isLast = attempts > budget;

        try {
            // eslint-disable-next-line no-await-in-loop
            const answer = await untilStopped(strategy.transcribe({ resource: request.resource as never, models: [...request.models] }, request.locale, {
                signal: request.signal,
                instructions: request.instructions,
                feedback,
                onRaw: request.onRaw,
                onUsage: (used) => {
                    tokens = (tokens ?? 0) + used;
                }
            }), request.signal);
            const validation = validateChunk(request.models, answer);

            issues.push(...validation.issues.filter((issue) => !issues.some((known) => known.message === issue.message)));

            if (validation.status === 'clean' || (validation.status === 'flagged' && isLast)) {
                return finish('done', validation.rows, null);
            }

            if (validation.status === 'rejected' && isLast) {
                return finish('failed', [], new ChunkRejectedError(validation.issues.map((issue) => issue.message).join(' ')));
            }

            feedback = validation.issues.map((issue) => issue.message).join(' ');
        } catch (error) {
            if (request.signal?.aborted) {
                return finish('stopped', [], null);
            }

            const failure = error instanceof Error ? error : new Error(String(error));

            if (isLast || !isRetryable(failure)) {
                return finish('failed', [], failure);
            }

            // eslint-disable-next-line no-await-in-loop
            await wait(delayOf(failure, attempts, request.retryDelayMs ?? 1000), request.signal);
        }
    }
}

/**
 * Returns whether another attempt can help. A failure says so itself, or through its cause: a provider knows a rate limit from
 * a rejected key.
 *
 * @public
 * @param error The failure.
 * @returns `true` when it may pass.
 */
export function isRetryable(error: unknown): boolean {
    let current = error as { retryable?: unknown; isRetryable?: unknown; cause?: unknown } | null | undefined;

    for (let depth = 0; current && typeof current === 'object' && depth < 8; depth++) {
        if (current.retryable === true || current.isRetryable === true) {
            return true;
        }

        if (current.retryable === false || current.isRetryable === false) {
            return false;
        }

        current = current.cause as typeof current;
    }

    return false;
}

/**
 * Ends the wait for a call that was cancelled, also when the provider takes its time to notice.
 *
 * @private
 */
function untilStopped<T>(call: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return call;
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = (): void => reject(new Error('The chunk was stopped.'));

        signal.addEventListener('abort', onAbort, { once: true });
        call.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/**
 * @private
 */
function delayOf(error: Error, attempt: number, first: number): number {
    const retryAt = (error as { retryAt?: unknown }).retryAt;
    const planned = typeof retryAt === 'number' ? retryAt - Date.now() : first * 2 ** (attempt - 1);

    return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, planned));
}

/**
 * @private
 */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(done, ms);

        function done(): void {
            clearTimeout(timer);
            signal?.removeEventListener('abort', done);
            resolve();
        }

        signal?.addEventListener('abort', done, { once: true });
    });
}
