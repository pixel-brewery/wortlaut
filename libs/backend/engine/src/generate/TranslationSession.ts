// #region Imports

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describePlaceholderProblem, runTranslation, type IChunkIssue, type IResourceGeneratorStrategy, type ITranslationGate, type ITranslationPlan } from '@pixel-brewery/wortlaut-ai';
import type { GenerateCheck, GenerateInput, GenerateLocaleProgress, GenerateRow, GenerateRun, GenerateStatus } from '@pixel-brewery/wortlaut-contracts';
import { createKeyPattern, type IResourceInfo } from '@pixel-brewery/wortlaut-core';
import { createRawOutputFile } from './RawOutputFile.js';

// #endregion

/**
 * The most lines of its log a run keeps.
 */
const MAX_LOG_LINES = 500;

/**
 * A base value this short says little, so a reviewer should look at its translation.
 */
const SHORT_TEXT = 2;

/**
 * One catalog a locale is translated into.
 *
 * @internal
 */
export interface ISessionPlan {
    resource: IResourceInfo;
    plan: ITranslationPlan;
    display: string;
}

/**
 * What a session is made of.
 *
 * @internal
 */
export interface ITranslationSessionInit {
    runId: string;
    projectId: string;
    input: GenerateInput;
    dryRun: boolean;
    provider: { id: GenerateInput['provider']; name: string; kind: 'local' | 'key' };
    baseLocale: string;
    baseName: string;
    plans: ReadonlyArray<{ locale: string; plans: ReadonlyArray<ISessionPlan>; estimatedTokens: number; instructions: Array<string> }>;
    identicalKeys: ReadonlyArray<string>;
    identicalValues: ReadonlyArray<string>;
    retryDelayMs?: number;
    keepRawOutput?: boolean;
    onChange: () => void;
    now: () => Date;
    scrub?: (text: string) => string;
}

/**
 * A row of the review, with where it goes.
 */
interface ISessionRow extends GenerateRow {
    comment: string;
    targetPath: string;
}

/**
 * What a run has come to for one locale.
 */
interface ISessionLocale {
    locale: string;
    status: GenerateLocaleProgress['status'];
    plans: ReadonlyArray<ISessionPlan>;
    instructions: Array<string>;
    chunks: Array<GenerateLocaleProgress['chunks'][number]>;
    rows: Map<string, ISessionRow>;
    issues: Array<{ chunk: number; issue: IChunkIssue }>;
    asked: number;
    reportedTokens: number | null;
    estimatedTokens: number;
    doneKeys: number;
    totalKeys: number;
}

/**
 * One run of Generate while it goes on and while its review stays open. It translates the locales one after the other through
 * the one path of `libs/backend/ai`, and holds what a view shows and what the user changed. Nothing of it reaches a catalog
 * on its own: a change set of the rows that are accepted does that.
 *
 * @internal
 */
export class TranslationSession implements ITranslationGate {

    // #region Fields

    private readonly _init: ITranslationSessionInit;
    private readonly _locales: Array<ISessionLocale>;
    private readonly _stop: AbortController;
    private readonly _log: Array<string>;
    private readonly _readHashes: Map<string, string | null>;
    private _status: GenerateStatus;
    private _failure: GenerateRun['failure'];
    private _isPaused: boolean;
    private _waiting: Array<() => void>;
    private _decide: ((decision: 'retry' | 'stop') => void) | null;
    private _startedAt: Date;
    private _pausedMs: number;
    private _pausedAt: Date | null;
    private _endedAt: Date | null;
    private _changeSetId: string | null;
    private _partial: boolean;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `TranslationSession` class.
     *
     * @param init What the session is made of.
     */
    public constructor(init: ITranslationSessionInit) {
        this._init = init;
        this._stop = new AbortController();
        this._log = [];
        this._readHashes = new Map();
        this._status = 'running';
        this._failure = null;
        this._isPaused = false;
        this._waiting = [];
        this._decide = null;
        this._startedAt = init.now();
        this._pausedMs = 0;
        this._pausedAt = null;
        this._endedAt = null;
        this._changeSetId = null;
        this._partial = false;
        this._locales = init.plans.map(({ locale, plans, estimatedTokens, instructions }) => ({
            locale,
            status: 'waiting',
            plans,
            instructions,
            chunks: plans.flatMap(({ plan }) => plan.chunks.map(() => 'waiting' as const)),
            rows: new Map(),
            issues: [],
            asked: 0,
            reportedTokens: null,
            estimatedTokens,
            doneKeys: 0,
            totalKeys: plans.reduce((sum, { plan }) => sum + plan.models.length, 0)
        }));
    }

    // #endregion

    // #region Properties

    /**
     * Gets the id of the run.
     *
     * @readonly
     */
    public get runId(): string {
        return this._init.runId;
    }

    /**
     * Gets the project of the run.
     *
     * @readonly
     */
    public get projectId(): string {
        return this._init.projectId;
    }

    /**
     * Gets the setup of the run.
     *
     * @readonly
     */
    public get input(): GenerateInput {
        return this._init.input;
    }

    /**
     * Gets how the run stands.
     *
     * @readonly
     */
    public get status(): GenerateStatus {
        return this._status;
    }

    /**
     * Gets whether no more chunks will come.
     *
     * @readonly
     */
    public get hasEnded(): boolean {
        return this._status === 'done' || this._status === 'stopped' || (this._status === 'failed' && this._failure?.canResume === false);
    }

    /**
     * Gets or sets the pending change set that holds what is not written yet.
     */
    public get changeSetId(): string | null {
        return this._changeSetId;
    }

    public set changeSetId(value: string | null) {
        this._changeSetId = value;
    }

    /**
     * Gets or sets whether that change set holds only what a stopped run finished.
     */
    public get partial(): boolean {
        return this._partial;
    }

    public set partial(value: boolean) {
        this._partial = value;
    }

    /**
     * Gets the catalogs of the session, for taking their state before the first request.
     *
     * @readonly
     */
    public get targetPaths(): Array<string> {
        return this._locales.flatMap((locale) => locale.plans.map(({ plan }) => plan.targetPath));
    }

    // #endregion

    // #region Methods

    /**
     * Runs all locales, one after the other.
     *
     * @param strategy The strategy.
     * @param signal Stops the run from outside, as quitting does.
     * @param log Writes a line of the log of the run.
     * @returns When the run has ended. It never rejects: a failure is a state.
     */
    public async run(strategy: IResourceGeneratorStrategy, signal: AbortSignal | undefined, log: (line: string) => void): Promise<void> {
        const stopped = signal ? AbortSignal.any([signal, this._stop.signal]) : this._stop.signal;
        const write = (line: string): void => {
            this.addLog(line);
            log(line);
        };

        const keepRaw = this._init.keepRawOutput ? createRawOutputFile(this._init.runId, write) : undefined;

        stopped.addEventListener('abort', () => this.wake(), { once: true });

        for (const locale of this._locales) {
            locale.status = 'running';
            this._init.onChange();

            let offset = 0;

            for (const { resource, plan } of locale.plans) {
                write(`Translating from ${this._init.baseLocale} to ${locale.locale}`);
                write(`Splitting ${plan.models.length} keys into ${plan.chunks.length} chunks`);

                // eslint-disable-next-line no-await-in-loop
                const outcome = await runTranslation({
                    strategy,
                    resource,
                    locale: locale.locale,
                    chunks: plan.chunks,
                    instructions: locale.instructions,
                    signal: stopped,
                    gate: this,
                    retryDelayMs: this._init.retryDelayMs,
                    onRaw: keepRaw,
                    onChunkStart: (index) => this.onChunkStart(locale, offset + index),
                    onChunkEnd: (index, report) => {
                        const chunk = offset + index;

                        locale.asked += report.attempts;
                        locale.reportedTokens = report.tokens === null ? locale.reportedTokens : (locale.reportedTokens ?? 0) + report.tokens;
                        locale.issues.push(...report.issues.map((issue) => ({ chunk, issue })));

                        for (const issue of report.issues) {
                            write(`Warning: chunk ${chunk + 1}: ${issue.message}`);
                        }

                        if (report.status === 'done') {
                            this.addRows(locale, plan.targetPath, report.rows);
                            locale.chunks[chunk] = 'done';
                            write(`Chunk ${chunk + 1} of ${locale.chunks.length} completed`);
                        } else if (report.status === 'failed') {
                            locale.chunks[chunk] = 'failed';
                            this.setFailure(locale, chunk, report.error as Error);
                        } else {
                            locale.chunks[chunk] = 'waiting';
                        }

                        this._init.onChange();
                    }
                });

                if (outcome.status !== 'completed') {
                    locale.status = 'stopped';
                    this.finish('stopped');
                    write('The run was stopped. Nothing was written.');

                    return;
                }

                offset += plan.chunks.length;
            }

            locale.status = 'done';
        }

        this.finish('done');
    }

    /**
     * Takes note of what a target holds now, so a write can tell when someone else changed it.
     *
     * @param path The target file.
     */
    public noteRead(path: string): void {
        this._readHashes.set(path, hashOf(path));
    }

    /**
     * Returns whether a target differs from what this run last read of it.
     *
     * @param path The target file.
     * @returns `true` when someone else changed it.
     */
    public hasChangedSinceRead(path: string): boolean {
        return this._readHashes.has(path) && this._readHashes.get(path) !== hashOf(path);
    }

    /**
     * Pauses the run: the chunk in flight finishes, and no new one starts.
     */
    public pause(): void {
        if (this._status === 'running') {
            this._isPaused = true;
            this._status = 'paused';
            this._pausedAt = this._init.now();
            this._init.onChange();
        }
    }

    /**
     * Goes on, after a pause or from the chunk that failed.
     */
    public resume(): void {
        if (this._status !== 'paused' && !(this._status === 'failed' && this._failure?.canResume)) {
            return;
        }

        this._isPaused = false;
        this._failure = null;
        this._status = 'running';

        if (this._pausedAt) {
            this._pausedMs += this._init.now().getTime() - this._pausedAt.getTime();
            this._pausedAt = null;
        }

        this.wake('retry');
        this._init.onChange();
    }

    /**
     * Ends the run. A chunk in flight is cancelled, and what was finished stays in the review.
     */
    public stop(): void {
        this._stop.abort();
    }

    /**
     * Ends a session that could not even start.
     *
     * @param message Why.
     */
    public failToStart(message: string): void {
        this._failure = { locale: this._locales[0]?.locale ?? '', chunk: 1, message: this.scrub(message), canResume: false };
        this._status = 'failed';
        this.finish('failed');
    }

    /**
     * @override
     */
    public waitForTurn(): Promise<void> {
        if (!this._isPaused || this._stop.signal.aborted) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this._waiting.push(resolve);
        });
    }

    /**
     * @override
     */
    public afterFailure(): Promise<'retry' | 'stop'> {
        if (this._stop.signal.aborted) {
            return Promise.resolve('stop');
        }

        return new Promise((resolve) => {
            this._decide = resolve;
        });
    }

    /**
     * Changes a row. An edit validates again: a value that became clean is accepted, and one with a problem is not.
     *
     * @param locale The locale.
     * @param key The key.
     * @param change What changes.
     * @returns The row as a view shows it.
     * @throws Error when the run does not hold the row.
     */
    public setRow(locale: string, key: string, change: { value?: string; accepted?: boolean }): GenerateRow {
        const target = this.requireLocale(locale);
        const row = target.rows.get(key);

        if (!row) {
            throw new Error(`This run holds no key ${key} for ${locale}.`);
        }

        if (change.value !== undefined && change.value !== row.value) {
            Object.assign(row, this.judge(row.key, row.base, row.comment, change.value), { value: change.value, written: false });
        }

        if (change.accepted !== undefined && row.canAccept) {
            row.accepted = change.accepted;
        }

        this._init.onChange();

        return viewOf(row);
    }

    /**
     * Returns the rows that a write would take, for a locale or for all.
     *
     * @param locale The locale, or `null` for all.
     * @returns The rows by target file, in their order.
     */
    public acceptedRows(locale: string | null): Map<string, { locale: string; rows: Array<ISessionRow> }> {
        const byTarget = new Map<string, { locale: string; rows: Array<ISessionRow> }>();

        for (const entry of this._locales.filter((candidate) => locale === null || candidate.locale === locale)) {
            for (const row of entry.rows.values()) {
                if (row.accepted && !row.written) {
                    const target = byTarget.get(row.targetPath) ?? { locale: entry.locale, rows: [] };

                    target.rows.push(row);
                    byTarget.set(row.targetPath, target);
                }
            }
        }

        return byTarget;
    }

    /**
     * Returns the base catalog of a target file.
     *
     * @param targetPath The target file.
     * @returns The base catalog.
     */
    public baseOf(targetPath: string): IResourceInfo {
        const found = this._locales.flatMap((locale) => locale.plans).find(({ plan }) => plan.targetPath === targetPath);

        if (!found) {
            throw new Error('This run holds no such file.');
        }

        return found.resource;
    }

    /**
     * Takes note that rows reached their catalog.
     *
     * @param rows The rows.
     */
    public markWritten(rows: ReadonlyArray<ISessionRow>): void {
        for (const row of rows) {
            row.written = true;
        }

        this._init.onChange();
    }

    /**
     * Returns how many rows were finished.
     *
     * @returns The count, of all locales.
     */
    public translatedCount(): number {
        return this._locales.reduce((sum, locale) => sum + locale.rows.size, 0);
    }

    /**
     * Describes the run for a view.
     *
     * @param locale The locale whose rows the view wants, or `null` for the one that is going on.
     * @returns The run.
     */
    public describe(locale: string | null): GenerateRun {
        const current = this._locales.find((candidate) => candidate.locale === locale) ??
            this._locales.find((candidate) => candidate.status === 'running') ??
            [...this._locales].reverse().find((candidate) => candidate.status !== 'waiting') ??
            this._locales[0];
        const end = this._endedAt ?? this._pausedAt ?? this._init.now();

        return {
            runId: this._init.runId,
            projectId: this._init.projectId,
            status: this._status,
            failure: this._failure,
            dryRun: this._init.dryRun,
            provider: this._init.provider,
            baseLocale: this._init.baseLocale,
            input: this._init.input,
            startedAt: this._startedAt.toISOString(),
            elapsedMs: Math.max(0, end.getTime() - this._startedAt.getTime() - this._pausedMs),
            locales: this._locales.map((entry) => this.progressOf(entry)),
            locale: current?.locale ?? '',
            rows: current ? Array.from(current.rows.values(), viewOf) : [],
            checks: current ? this.checksOf(current) : [],
            log: [...this._log],
            changeSetId: this._changeSetId,
            partial: this._partial
        };
    }

    /**
     * @private
     */
    private onChunkStart(locale: ISessionLocale, chunk: number): void {
        locale.chunks[chunk] = 'running';
        this._init.onChange();
    }

    /**
     * @private
     */
    private addRows(locale: ISessionLocale, targetPath: string, rows: ReadonlyArray<{ key: string; value: string; comment: string; problem: string | null }>): void {
        const plan = locale.plans.find((candidate) => candidate.plan.targetPath === targetPath);
        const bases = new Map(plan?.plan.models.map((model) => [model.key, model.value]));

        for (const row of rows) {
            const base = String(bases.get(row.key) ?? '');
            const judged = this.judge(row.key, base, row.comment ?? '', row.value);

            locale.rows.set(row.key, { key: row.key, base, comment: row.comment ?? '', value: row.value, written: false, targetPath, ...judged });
            locale.doneKeys++;
        }
    }

    /**
     * Decides what a value needs from a reviewer.
     *
     * @private
     */
    private judge(key: string, base: string, comment: string, value: string): Pick<GenerateRow, 'note' | 'severity' | 'accepted' | 'canAccept'> {
        const problem = value === '' && base !== '' ? 'The translation is empty' : describePlaceholderProblem(base, value);

        if (problem) {
            return { note: problem, severity: 'danger', accepted: false, canAccept: !this._init.input.protectPlaceholders };
        }

        if (value === base && !this.mayStayIdentical(key, value)) {
            return { note: `Identical to ${this._init.baseName}`, severity: 'warning', accepted: false, canAccept: true };
        }

        if (base.length <= SHORT_TEXT && base.length > 0 && !comment) {
            return { note: 'Very short text. Add a comment for context.', severity: 'warning', accepted: false, canAccept: true };
        }

        return { note: null, severity: 'none', accepted: true, canAccept: true };
    }

    /**
     * @private
     */
    private mayStayIdentical(key: string, value: string): boolean {
        return this._init.identicalValues.includes(value) || this._init.identicalKeys.some((pattern) => createKeyPattern(pattern).test(key));
    }

    /**
     * @private
     */
    private setFailure(locale: ISessionLocale, chunk: number, error: Error): void {
        this._failure = { locale: locale.locale, chunk: chunk + 1, message: this.scrub(error.message), canResume: true };
        this._status = 'failed';
        locale.status = 'failed';
        this._pausedAt ??= this._init.now();
    }

    /**
     * @private
     */
    private finish(status: GenerateStatus): void {
        this._status = status;
        this._isPaused = false;
        this._endedAt ??= this._init.now();
        this._init.onChange();
    }

    /**
     * @private
     */
    private wake(decision: 'retry' | 'stop' = 'stop'): void {
        const decide = this._decide;
        const waiting = this._waiting;

        this._decide = null;
        this._waiting = [];
        decide?.(decision);

        for (const resolve of waiting) {
            resolve();
        }
    }

    /**
     * @private
     */
    private addLog(line: string): void {
        this._log.push(this.scrub(line));

        if (this._log.length > MAX_LOG_LINES) {
            this._log.shift();
        }
    }

    /**
     * @private
     */
    private scrub(text: string): string {
        return this._init.scrub?.(text) ?? text;
    }

    /**
     * @private
     */
    private requireLocale(locale: string): ISessionLocale {
        const found = this._locales.find((candidate) => candidate.locale === locale);

        if (!found) {
            throw new Error(`This run does not translate ${locale}.`);
        }

        return found;
    }

    /**
     * @private
     */
    private progressOf(locale: ISessionLocale): GenerateLocaleProgress {
        const rows = Array.from(locale.rows.values());

        return {
            locale: locale.locale,
            status: locale.status,
            target: locale.plans.map(({ display }) => display).join(', '),
            doneKeys: locale.doneKeys,
            totalKeys: locale.totalKeys,
            doneChunks: locale.chunks.filter((chunk) => chunk === 'done').length,
            totalChunks: locale.chunks.length,
            chunks: locale.chunks,
            estimatedTokens: locale.reportedTokens ?? Math.round(locale.estimatedTokens * (locale.totalKeys > 0 ? locale.doneKeys / locale.totalKeys : 0)),
            needsAttention: rows.filter((row) => row.severity !== 'none' && !row.written).length,
            writable: rows.filter((row) => row.accepted && !row.written).length
        };
    }

    /**
     * Writes the automatic checks of a locale.
     *
     * @private
     */
    private checksOf(locale: ISessionLocale): Array<GenerateCheck> {
        const rows = Array.from(locale.rows.values());
        const issueOf = (...kinds: ReadonlyArray<IChunkIssue['kind']>): { chunk: number; issue: IChunkIssue } | undefined => locale.issues.find(({ issue }) => kinds.includes(issue.kind));
        const lost = rows.filter((row) => row.severity === 'danger').length;
        const identical = rows.filter((row) => row.value === row.base && row.base !== '').length;
        const counted = issueOf('row-count');
        const keys = issueOf('unknown-key', 'missing-key', 'duplicate-key', 'shape');

        return [
            lost > 0
                ? { id: 'placeholders', title: 'Placeholders', text: `${lost} of ${rows.length} values lost a placeholder or their text.`, severity: 'danger' }
                : { id: 'placeholders', title: 'Placeholders', text: rows.length > 0 ? 'Every value keeps its placeholders.' : 'No value yet.', severity: 'success' },
            counted
                ? { id: 'row-count', title: 'Row count', text: this.scrub(`Chunk ${counted.chunk + 1}: ${counted.issue.message} Unknown rows were dropped, and a chunk that missed a key was asked again.`), severity: 'warning' }
                : { id: 'row-count', title: 'Row count', text: 'Every chunk returned one row per key.', severity: 'success' },
            identical > 0
                ? { id: 'identical', title: `Identical to ${this._init.baseName}`, text: `${identical} of ${rows.length} values are identical to the source.`, severity: 'warning' }
                : { id: 'identical', title: `Identical to ${this._init.baseName}`, text: 'No value is identical to the source.', severity: 'success' },
            keys
                ? { id: 'keys', title: 'Keys', text: this.scrub(`Chunk ${keys.chunk + 1}: ${keys.issue.message}`), severity: 'warning' }
                : { id: 'keys', title: 'Keys', text: 'All keys returned unchanged.', severity: 'success' }
        ];
    }

    // #endregion

}

/**
 * @private
 */
function hashOf(path: string): string | null {
    return existsSync(path) ? createHash('sha256').update(readFileSync(path))
        .digest('hex') : null;
}

/**
 * @private
 */
function viewOf(row: ISessionRow): GenerateRow {
    const { key, base, value, note, severity, accepted, canAccept, written } = row;

    return { key, base, value, note, severity, accepted, canAccept, written };
}
