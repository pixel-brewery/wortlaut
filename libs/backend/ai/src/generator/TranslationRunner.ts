// #region Imports

import type { IResourceModel } from '@pixel-brewery/wortlaut-core';
import type { IChunkIssue, IValidatedRow } from '../validation/ChunkValidator.js';
import { translateChunk, type IChunkReport, type IChunkRequest } from './ChunkTranslator.js';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy.js';

// #endregion

/**
 * What a host decides between chunks. Without one, a run goes straight through and ends at its first failure.
 *
 * @public
 */
export interface ITranslationGate {

    /**
     * Waits while the run is paused. It returns at once when the run goes on, and also when it was stopped.
     */
    waitForTurn(): Promise<void>;

    /**
     * Decides what becomes of a failed chunk: `retry` asks it again, `stop` ends the run.
     *
     * @param chunkIndex The chunk, from zero.
     * @param error The failure.
     * @returns The decision.
     */
    afterFailure(chunkIndex: number, error: Error): Promise<'retry' | 'stop'>;
}

/**
 * What a run of chunks is made of.
 *
 * @public
 */
export interface ITranslationRunInit extends Pick<IChunkRequest, 'resource' | 'locale' | 'instructions' | 'signal' | 'retryBudget' | 'retryDelayMs' | 'onRaw'> {
    strategy: IResourceGeneratorStrategy;
    chunks: ReadonlyArray<ReadonlyArray<IResourceModel>>;
    gate?: ITranslationGate;

    /**
     * Called before a chunk starts, from zero.
     */
    onChunkStart?: (chunkIndex: number) => void;

    /**
     * Called for every chunk that ended, however it ended.
     */
    onChunkEnd?: (chunkIndex: number, report: IChunkReport) => void;
}

/**
 * How a run of chunks ended.
 *
 * @public
 */
export interface ITranslationOutcome {
    status: 'completed' | 'failed' | 'stopped';

    /**
     * The rows of every finished chunk.
     */
    rows: Array<IValidatedRow>;

    /**
     * What the checks found.
     */
    issues: Array<IChunkIssue>;
    finishedChunks: number;
    tokens: number | null;
    error: Error | null;
}

/**
 * Runs the chunks of one locale one after the other, with progress per chunk. It holds no opinion on pausing: a gate decides,
 * and pausing means that no new chunk starts. Stopping cancels a chunk in flight through the signal.
 *
 * @public
 * @param init The run.
 * @returns How it ended. It never rejects: a failure is a state.
 */
export async function runTranslation(init: ITranslationRunInit): Promise<ITranslationOutcome> {
    const rows = new Array<IValidatedRow>();
    const issues = new Array<IChunkIssue>();
    const end = (status: ITranslationOutcome['status'], error: Error | null): ITranslationOutcome => ({ status, rows, issues, finishedChunks: index, tokens, error });
    let index = 0;
    let tokens: number | null = null;

    while (index < init.chunks.length) {
        // eslint-disable-next-line no-await-in-loop
        await init.gate?.waitForTurn();

        if (init.signal?.aborted) {
            return end('stopped', null);
        }

        init.onChunkStart?.(index);

        // eslint-disable-next-line no-await-in-loop
        const report = await translateChunk(init.strategy, { ...init, models: init.chunks[index] });

        issues.push(...report.issues);
        tokens = report.tokens === null ? tokens : (tokens ?? 0) + report.tokens;
        init.onChunkEnd?.(index, report);

        if (report.status === 'stopped') {
            return end('stopped', null);
        }

        if (report.status === 'failed') {
            const failure = report.error as Error;

            if (!init.gate) {
                return end('failed', failure);
            }

            // eslint-disable-next-line no-await-in-loop
            if (await init.gate.afterFailure(index, failure) === 'stop') {
                return end('stopped', null);
            }
        } else {
            rows.push(...report.rows);
            index++;
        }
    }

    return end('completed', null);
}
