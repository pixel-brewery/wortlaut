// #region Imports

import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { GenerateRow, GenerateRun, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import { bindShortcuts, DesktopApi, formatCount, formatDuration, formatTokens, localeName, RunCenter, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many rows the table shows at first.
 */
const PAGE_SIZE = 200;

/**
 * How long the view waits after a keystroke before it tells main.
 */
const EDIT_DELAY_MS = 250;

/**
 * Which rows the review shows.
 */
export type GenerateRowFilter = 'all' | 'attention';

/**
 * Says how a run stands.
 *
 * @param run The run.
 * @returns The label and variant of its badge.
 */
export function describeStatus(run: Pick<GenerateRun, 'status' | 'failure'>): { label: string; variant: 'info' | 'danger' | 'success' | 'warning' | 'neutral' } {
    switch (run.status) {
        case 'running':
            return { label: 'Translating', variant: 'info' };
        case 'paused':
            return { label: 'Paused', variant: 'warning' };
        case 'failed':
            return { label: run.failure?.canResume ? `Stopped at chunk ${run.failure.chunk}` : 'Could not start', variant: 'danger' };
        case 'stopped':
            return { label: 'Stopped', variant: 'neutral' };
        default:
            return { label: 'Ready for review', variant: 'success' };
    }
}

/**
 * Owns Generate: run and review. The run lives in main, so a reload finds it again. This holds which locale is open, which
 * rows show and what the user is typing.
 */
@Injectable()
export class GenerateRunViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _center = inject(RunCenter);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _run = signal<GenerateRun | null>(null);
    private readonly _locale = signal<string | null>(null);
    private readonly _filter = signal<GenerateRowFilter>('all');
    private readonly _limit = signal(PAGE_SIZE);
    private readonly _edits = signal<Readonly<Record<string, string>>>({});
    private readonly _error = signal<string | null>(null);
    private readonly _outcome = signal<WriteOutcome | null>(null);
    private readonly _message = signal<string | null>(null);
    private readonly _busy = signal(false);
    private readonly _tick = signal(0);
    private readonly _editTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private _fetchedAt = 0;
    private _isFetching = false;
    private _fetchAgain = false;
    private _runId = '';

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `GenerateRunViewPresenter` class.
     */
    public constructor() {
        bindShortcuts({
            next: () => {
                if (this.attentionCount() > 0) {
                    this.pickFilter('attention');
                }
            }
        });

        const stopListening = this._api.onEvent((event) => {
            if (event.type === 'generate.updated' && event.runId === this._runId) {
                void this.fetch();
            }
        });
        const clock = setInterval(() => {
            if (this._run()?.status === 'running') {
                this._tick.update((tick) => tick + 1);
            }
        }, 1000);

        inject(DestroyRef).onDestroy(() => {
            stopListening();
            clearInterval(clock);

            for (const timer of this._editTimers.values()) {
                clearTimeout(timer);
            }
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the run.
     *
     * @readonly
     */
    public readonly run = this._run.asReadonly();

    /**
     * Gets why the run could not be read.
     *
     * @readonly
     */
    public readonly error = this._error.asReadonly();

    /**
     * Gets the locale that is open.
     *
     * @readonly
     */
    public readonly current = computed(() => {
        const run = this._run();

        return run?.locales.find((locale) => locale.locale === run.locale) ?? run?.locales[0] ?? null;
    });

    /**
     * Gets the heading of the view.
     *
     * @readonly
     */
    public readonly title = computed(() => {
        const run = this._run();

        return run ? `${localeName(run.baseLocale)} to ${localeName(run.locale)}` : '';
    });

    /**
     * Gets the name of the base locale, for the table.
     *
     * @readonly
     */
    public readonly baseName = computed(() => localeName(this._run()?.baseLocale ?? 'en'));

    /**
     * Gets the name of the target locale, for the table.
     *
     * @readonly
     */
    public readonly targetName = computed(() => localeName(this._run()?.locale ?? ''));

    /**
     * Gets the badge of the run.
     *
     * @readonly
     */
    public readonly status = computed(() => {
        const run = this._run();

        return run ? describeStatus(run) : { label: '', variant: 'neutral' as const };
    });

    /**
     * Gets the line below the heading.
     *
     * @readonly
     */
    public readonly subtitle = computed(() => {
        const run = this._run();

        if (!run) {
            return '';
        }

        const login = run.provider.kind === 'local' ? 'local login' : run.input.model;

        return `${run.provider.name} · ${login} · ${run.input.chunkSize} keys per chunk · target `;
    });

    /**
     * Gets the locales when there are several.
     *
     * @readonly
     */
    public readonly localeSwitch = computed(() => {
        const run = this._run();

        return run && run.locales.length > 1 ? run.locales.map((locale) => ({ code: locale.locale, name: localeName(locale.locale), isChecked: locale.locale === run.locale })) : [];
    });

    /**
     * Gets the figures of the progress.
     *
     * @readonly
     */
    public readonly progress = computed(() => {
        const current = this.current();

        return {
            keys: `${formatCount(current?.doneKeys ?? 0)} of ${formatCount(current?.totalKeys ?? 0)} keys`,
            doneKeys: current?.doneKeys ?? 0,
            totalKeys: current?.totalKeys ?? 0,
            chunk: `Chunk ${Math.min((current?.doneChunks ?? 0) + (this._run()?.status === 'done' ? 0 : 1), current?.totalChunks ?? 0)} of ${current?.totalChunks ?? 0}`,
            tokens: `${formatTokens(current?.estimatedTokens ?? 0)} tokens`
        };
    });

    /**
     * Gets the elapsed time, which goes on while the run does.
     *
     * @readonly
     */
    public readonly elapsed = computed(() => {
        this._tick();

        const run = this._run();

        if (!run) {
            return '';
        }

        return formatDuration(run.status === 'running' ? run.elapsedMs + Date.now() - this._fetchedAt : run.elapsedMs);
    });

    /**
     * Gets one cell per chunk.
     *
     * @readonly
     */
    public readonly cells = computed(() => (this.current()?.chunks ?? []).map((state, index) => ({ index, state, title: `Chunk ${index + 1}: ${state}` })));

    /**
     * Gets whether Dry run is on. A run keeps the value it started with, but what is written follows the switch.
     *
     * @readonly
     */
    public readonly dryRun = this._shell.dryRun;

    /**
     * Gets the filter of the review.
     *
     * @readonly
     */
    public readonly filter = this._filter.asReadonly();

    /**
     * Gets how many rows need attention.
     *
     * @readonly
     */
    public readonly attentionCount = computed(() => this.current()?.needsAttention ?? 0);

    /**
     * Gets the rows of the review, with what the user is typing.
     *
     * @readonly
     */
    public readonly rows = computed(() => {
        const edits = this._edits();
        const rows = this._run()?.rows ?? [];

        return rows
            .filter((row) => this._filter() === 'all' || (row.severity !== 'none' && !row.written))
            .slice(0, this._limit())
            .map((row) => ({ ...row, value: edits[row.key] ?? row.value, isDanger: row.severity === 'danger', noteClass: row.severity === 'danger' ? 'note-danger' : 'note-warning' }));
    });

    /**
     * Gets whether more rows can show.
     *
     * @readonly
     */
    public readonly hasMoreRows = computed(() => (this._run()?.rows.length ?? 0) > this._limit());

    /**
     * Gets the automatic checks.
     *
     * @readonly
     */
    public readonly checks = computed(() => (this._run()?.checks ?? []).map((check) => ({ ...check, icon: check.severity === 'success' ? 'checkmarkCircle' : 'warning' })));

    /**
     * Gets the log so far.
     *
     * @readonly
     */
    public readonly log = computed(() => (this._run()?.log ?? []).join('\n'));

    /**
     * Gets how many rows a write would take.
     *
     * @readonly
     */
    public readonly writable = computed(() => this.current()?.writable ?? 0);

    /**
     * Gets the label of the write button.
     *
     * @readonly
     */
    public readonly writeLabel = computed(() => `Write ${formatCount(this.writable())} accepted`);

    /**
     * Gets why a write is not possible now, or `null` when it is.
     *
     * @readonly
     */
    public readonly writeBlocker = computed(() => {
        const run = this._run();

        if (!run) {
            return 'This run could not be read.';
        }

        if (this._shell.dryRun()) {
            return 'Dry run is on. Turn it off in the title bar to write.';
        }

        if (run.status === 'running') {
            return 'Pause the run first, or wait until it has ended.';
        }

        return this.writable() === 0 ? 'No accepted translation is left to write.' : null;
    });

    /**
     * Gets what the last write did.
     *
     * @readonly
     */
    public readonly outcome = this._outcome.asReadonly();

    /**
     * Gets why the last action failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets whether an action is going on.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets what the failed message says beyond the reason.
     *
     * @readonly
     */
    public readonly failureContent = computed(() => {
        const done = this.current()?.doneKeys ?? 0;

        return done > 0 ? `The ${formatCount(done)} translations before it are safe in this list. Nothing was written to the target file.` : 'Nothing was written to the target file.';
    });

    /**
     * Gets what the stopped message says.
     *
     * @readonly
     */
    public readonly stoppedContent = computed(() => {
        const run = this._run();

        return run?.changeSetId
            ? 'What it finished waits in Review, marked as partial. Nothing was written to the target file.'
            : 'It finished nothing that could be kept. Nothing was written to the target file.';
    });

    // #endregion

    // #region Methods

    /**
     * Loads the run the route names. A run that is going on keeps going, whatever happened to this view.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        this._runId = this._route.snapshot.paramMap.get('runId') ?? '';
        await this._center.connect();
        await this.fetch();
    }

    /**
     * Pauses the run: the chunk in flight finishes, and no new one starts.
     *
     * @returns When main knows.
     */
    public pause(): Promise<void> {
        return this.act('generate.pause');
    }

    /**
     * Goes on, after a pause or from the chunk that failed.
     *
     * @returns When main knows.
     */
    public resume(): Promise<void> {
        return this.act('generate.resume');
    }

    /**
     * Ends the run, and what it finished stays in the review.
     *
     * @returns When main knows.
     */
    public stop(): Promise<void> {
        return this.act('generate.stop');
    }

    /**
     * Starts a new run with the same setup.
     *
     * @returns When its view is open.
     */
    public async again(): Promise<void> {
        this._busy.set(true);
        this._message.set(null);

        try {
            const run = await this._api.request('generate.again', { runId: this._runId });

            this._center.track(run);
            await this._router.navigate(['/generate/runs', run.id]);
            this._runId = run.id;
            this._edits.set({});
            this._outcome.set(null);
            await this.fetch();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * Goes back to the set up.
     *
     * @returns When it is open.
     */
    public async backToSetup(): Promise<void> {
        await this._router.navigate(['/generate']);
    }

    /**
     * Opens another locale of the run.
     *
     * @param locale The locale.
     * @returns When it is loaded.
     */
    public async pickLocale(locale: string): Promise<void> {
        this._locale.set(locale);
        this._limit.set(PAGE_SIZE);
        await this.fetch();
    }

    /**
     * Chooses which rows the review shows.
     *
     * @param filter The filter.
     */
    public pickFilter(filter: GenerateRowFilter): void {
        this._filter.set(filter);
    }

    /**
     * Shows more rows.
     */
    public showMore(): void {
        this._limit.update((limit) => limit + PAGE_SIZE);
    }

    /**
     * Takes what the user typed. Main validates it shortly after.
     *
     * @param key The key.
     * @param value The value.
     */
    public edit(key: string, value: string): void {
        this._edits.update((edits) => ({ ...edits, [key]: value }));

        const waiting = this._editTimers.get(key);

        if (waiting) {
            clearTimeout(waiting);
        }

        this._editTimers.set(key, setTimeout(() => {
            this._editTimers.delete(key);
            void this.setRow(key, { value });
        }, EDIT_DELAY_MS));
    }

    /**
     * Accepts or rejects a row.
     *
     * @param row The row.
     * @param accepted The new value.
     * @returns When main knows.
     */
    public async accept(row: Pick<GenerateRow, 'key' | 'accepted'>, accepted: boolean): Promise<void> {
        if (row.accepted !== accepted) {
            await this.setRow(row.key, { accepted });
        }
    }

    /**
     * Writes the accepted rows of the open locale, as one change set.
     *
     * @returns When it is done.
     */
    public async write(): Promise<void> {
        const run = this._run();

        if (!run || this.writeBlocker() !== null) {
            return;
        }

        this._busy.set(true);
        this._message.set(null);
        this._outcome.set(null);

        try {
            this._outcome.set(await this._api.request('generate.write', { runId: this._runId, locale: run.locale }));
            await this.fetch();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * @private
     */
    private async act(method: 'generate.pause' | 'generate.resume' | 'generate.stop'): Promise<void> {
        this._message.set(null);

        try {
            await this._api.request(method, { runId: this._runId });
            await this.fetch();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * @private
     */
    private async setRow(key: string, change: { value?: string; accepted?: boolean }): Promise<void> {
        const run = this._run();

        if (!run) {
            return;
        }

        try {
            await this._api.request('generate.setRow', { runId: this._runId, locale: run.locale, key, ...change });

            if (change.value !== undefined) {
                this._edits.update(({ [key]: _done, ...others }) => others);
            }

            await this.fetch();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Asks main how the run stands. Events can come faster than answers, so only the latest question counts.
     *
     * @private
     */
    private async fetch(): Promise<void> {
        if (this._isFetching) {
            this._fetchAgain = true;

            return;
        }

        this._isFetching = true;

        try {
            const run = await this._api.request('generate.get', { runId: this._runId, locale: this._locale() });

            this._run.set(run);
            this._fetchedAt = Date.now();
            this._error.set(null);
        } catch (error) {
            this._error.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._isFetching = false;

            if (this._fetchAgain) {
                this._fetchAgain = false;
                void this.fetch();
            }
        }
    }

    // #endregion

}
