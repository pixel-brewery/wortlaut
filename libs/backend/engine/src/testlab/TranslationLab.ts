// #region Imports

import { translateChunk, type IAiProviderHost, type IChunkIssue } from '@pixel-brewery/wortlaut-ai';
import type { TestSetup, TestTranslateRequest, TestTranslation } from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { SecretScrubber } from '../security/SecretScrubber.js';

// #endregion

/**
 * How many times a sample is asked again.
 */
const SAMPLE_RETRY_BUDGET = 1;

/**
 * How many finished comparisons stay around.
 */
const MAX_COMPARISONS = 4;

/**
 * One comparison while it goes on.
 */
interface IComparison {
    state: TestTranslation;
    controller: AbortController;
}

/**
 * What a surface needs to compare two setups.
 *
 * @internal
 */
export interface ITranslationLabInit {
    ai: IAiProviderHost | null;
    now: () => number;
    createId: () => string;
}

/**
 * Compares two setups on a sample, over the one translation path of `libs/backend/ai`. It writes nothing and builds no change
 * set. A setup that fails shows its failure in its own column.
 *
 * @public
 */
export class TranslationLab {

    // #region Fields

    private readonly _init: ITranslationLabInit;
    private readonly _comparisons: Map<string, IComparison>;
    private readonly _listeners: Set<(id: string) => void>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `TranslationLab` class.
     *
     * @param init What the lab is composed of.
     */
    public constructor(init: ITranslationLabInit) {
        this._init = init;
        this._comparisons = new Map();
        this._listeners = new Set();
    }

    // #endregion

    // #region Methods

    /**
     * Listens to what happens to a comparison.
     *
     * @public
     * @param listener Called with the comparison that changed.
     * @returns What ends the subscription.
     */
    public subscribe(listener: (id: string) => void): () => void {
        this._listeners.add(listener);

        return () => this._listeners.delete(listener);
    }

    /**
     * Starts a comparison.
     *
     * @public
     * @param request The sample and the setups.
     * @param format The format of the catalogs.
     * @param baseLocale The base locale.
     * @returns How it stands.
     */
    public start(request: TestTranslateRequest, format: string, baseLocale: string): TestTranslation {
        const id = this._init.createId();
        const state: TestTranslation = {
            id,
            isRunning: true,
            locale: request.locale,
            rows: request.rows.map(({ key, base }) => ({ key, base })),
            setups: request.setups.map((setup, index) => ({
                name: index === 0 ? 'A' as const : 'B' as const,
                provider: setup.provider,
                providerName: setup.provider,
                model: setup.model,
                temperature: setup.temperature,
                status: 'running' as const,
                durationMs: null,
                estimatedTokens: null,
                issues: 0,
                failure: null,
                results: []
            }))
        };
        const comparison: IComparison = { state, controller: new AbortController() };

        this._comparisons.set(id, comparison);
        this.bound();

        void Promise.all(request.setups.map((setup, index) => this.runSetup(comparison, index, setup, request, format, baseLocale))).then(() => {
            state.isRunning = false;
            this.publish(id);
        });

        return state;
    }

    /**
     * Returns how a comparison stands.
     *
     * @public
     * @param id The comparison, or `null` for the latest.
     * @returns The comparison.
     */
    public get(id: string | null): TestTranslation | null {
        if (id) {
            return this._comparisons.get(id)?.state ?? null;
        }

        return Array.from(this._comparisons.values()).at(-1)?.state ?? null;
    }

    /**
     * Cancels a comparison.
     *
     * @public
     * @param id The comparison.
     */
    public cancel(id: string): void {
        this._comparisons.get(id)?.controller.abort();
    }

    /**
     * Cancels everything that goes on.
     *
     * @public
     */
    public cancelAll(): void {
        for (const { controller } of this._comparisons.values()) {
            controller.abort();
        }
    }

    /**
     * @private
     */
    private async runSetup(comparison: IComparison, index: number, setup: TestSetup, request: TestTranslateRequest, format: string, baseLocale: string): Promise<void> {
        const entry = comparison.state.setups[index];
        const startedAt = this._init.now();
        const scrubber = new SecretScrubber();

        try {
            if (!this._init.ai) {
                throw new EngineError('provider-not-ready', 'This surface has no AI providers.');
            }

            const provider = await this._init.ai.get(setup.provider);

            entry.providerName = provider.name;

            if (provider.state !== 'ready' && provider.state !== 'unknown') {
                throw new EngineError('provider-not-ready', `${provider.name} is not set up: ${provider.description}`);
            }

            const { strategy, secrets } = await this._init.ai.prepare(setup.provider, { model: setup.model, temperature: setup.temperature, instructions: request.instructions });

            for (const secret of secrets) {
                scrubber.add(secret);
            }

            const report = await translateChunk(strategy, {
                resource: { type: format, locale: baseLocale },
                locale: request.locale,
                models: request.rows.map(({ key, base, comment }) => ({ key, value: base, comment })),
                instructions: request.instructions,
                retryBudget: SAMPLE_RETRY_BUDGET,
                signal: comparison.controller.signal
            });

            entry.durationMs = this._init.now() - startedAt;
            entry.estimatedTokens = report.tokens;
            entry.status = report.status === 'done' ? 'done' : report.status;

            if (report.status === 'failed') {
                entry.failure = scrubber.scrub(report.error?.message ?? 'The provider gave no usable answer.');
            }

            const bases = new Map(request.rows.map(({ key, base }) => [key, base]));

            entry.results = report.rows.map((row) => ({ key: row.key, value: row.value, note: row.problem ?? (row.value === bases.get(row.key) && row.value !== '' ? 'Identical to the base value' : null) }));
            entry.issues = entry.results.filter((row) => row.note).length + report.issues.filter((issue: IChunkIssue) => issue.kind !== 'placeholder' && issue.kind !== 'empty-value').length;
        } catch (error) {
            entry.durationMs = this._init.now() - startedAt;
            entry.status = 'failed';
            entry.failure = scrubber.scrub(error instanceof Error ? error.message : String(error));
        }

        this.publish(comparison.state.id);
    }

    /**
     * @private
     */
    private bound(): void {
        for (const [id, { state }] of this._comparisons) {
            if (this._comparisons.size <= MAX_COMPARISONS) {
                break;
            }

            if (!state.isRunning) {
                this._comparisons.delete(id);
            }
        }
    }

    /**
     * @private
     */
    private publish(id: string): void {
        for (const listener of this._listeners) {
            listener(id);
        }
    }

    // #endregion

}
