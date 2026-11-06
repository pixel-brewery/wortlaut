// #region Imports

import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { GenerateRow, GenerateRun, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import {
  bindShortcuts,
  DesktopApi,
  formatCount,
  formatDuration,
  formatTokens,
  localeName,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many review rows or chunk cells the view shows at first.
 */
const PAGE_SIZE = 200;

/**
 * How long the view waits after a keystroke before it tells main.
 */
const EDIT_DELAY_MS = 250;

/** The row an edit belongs to, independent of the currently displayed locale. */
interface IRowContext {
  readonly runId: string;
  readonly locale: string;
  readonly key: string;
}

/** A draft remains visible until this exact value has reached main. */
interface IRowEdit extends IRowContext {
  readonly value: string;
}

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
export function describeStatus(run: Pick<GenerateRun, 'status' | 'failure'>): {
  label: string;
  variant: 'info' | 'danger' | 'success' | 'warning' | 'neutral';
} {
  switch (run.status) {
    case 'running':
      return { label: 'Translating', variant: 'info' };
    case 'paused':
      return { label: 'Paused', variant: 'warning' };
    case 'failed':
      return {
        label: run.failure?.canResume ? `Stopped at chunk ${run.failure.chunk}` : 'Could not start',
        variant: 'danger',
      };
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
  private readonly _filteredRows = computed(() =>
    (this._run()?.rows ?? []).filter(
      (row) => this._filter() === 'all' || (row.severity !== 'none' && !row.written),
    ),
  );
  private readonly _limit = signal(PAGE_SIZE);
  private readonly _cellLimit = signal(PAGE_SIZE);
  private readonly _edits = signal<Readonly<Record<string, IRowEdit>>>({});
  private readonly _error = signal<string | null>(null);
  private readonly _outcome = signal<WriteOutcome | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _tick = signal(0);
  private readonly _editTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _editRequests = new Map<IRowEdit, Promise<boolean>>();
  private readonly _rowRequests = new Map<Promise<boolean>, IRowContext>();
  private _rowUpdates = Promise.resolve(true);
  private _fetchedAt = 0;
  private _fetching: Promise<void> | null = null;
  private _fetchAgain = false;
  private _destroyed = false;
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
      },
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
      this._editTimers.clear();
      this._destroyed = true;

      for (const edit of Object.values(this._edits())) {
        void this.saveEdit(edit);
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

    return run && run.locales.length > 1
      ? run.locales.map((locale) => ({
          code: locale.locale,
          name: localeName(locale.locale),
          isChecked: locale.locale === run.locale,
        }))
      : [];
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
      tokens: `${formatTokens(current?.estimatedTokens ?? 0)} tokens`,
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

    return formatDuration(
      run.status === 'running' ? run.elapsedMs + Date.now() - this._fetchedAt : run.elapsedMs,
    );
  });

  /**
   * Gets the displayed page of chunk cells.
   *
   * @readonly
   */
  public readonly cells = computed(() =>
    (this.current()?.chunks ?? [])
      .slice(0, this._cellLimit())
      .map((state, index) => ({ index, state, title: `Chunk ${index + 1}: ${state}` })),
  );

  /**
   * Gets the full chunk count while the cell strip is paged.
   *
   * @public
   * @readonly
   */
  public readonly chunkCount = computed(() => this.current()?.chunks.length ?? 0);

  /**
   * Gets whether more chunk cells can be displayed.
   *
   * @public
   * @readonly
   */
  public readonly hasMoreCells = computed(() => this.chunkCount() > this._cellLimit());

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
    const run = this._run();

    return this._filteredRows()
      .slice(0, this._limit())
      .map((row) => ({
        ...row,
        value: run
          ? (edits[this.editKey({ runId: run.runId, locale: run.locale, key: row.key })]?.value ??
            row.value)
          : row.value,
        isDanger: row.severity === 'danger',
        noteClass: row.severity === 'danger' ? 'note-danger' : 'note-warning',
      }));
  });

  /**
   * Gets whether more rows can show.
   *
   * @readonly
   */
  public readonly hasMoreRows = computed(() => this._filteredRows().length > this._limit());

  /**
   * Gets the automatic checks.
   *
   * @readonly
   */
  public readonly checks = computed(() =>
    (this._run()?.checks ?? []).map((check) => ({
      ...check,
      icon: check.severity === 'success' ? 'checkmarkCircle' : 'warning',
    })),
  );

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

    return done > 0
      ? `The ${formatCount(done)} translations before it are safe in this list. Nothing was written to the target file.`
      : 'Nothing was written to the target file.';
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
    if (this._busy()) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      const runId = this._runId;

      if (!(await this.flushEdits(runId))) {
        return;
      }

      const run = await this._api.request('generate.again', { runId });

      this._center.track(run);
      await this._router.navigate(['/generate/runs', run.id]);
      this._runId = run.id;
      this._limit.set(PAGE_SIZE);
      this._cellLimit.set(PAGE_SIZE);
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
    if (await this.flushEdits(this._runId)) {
      await this._router.navigate(['/generate']);
    }
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
    this._cellLimit.set(PAGE_SIZE);
    await this.fetch();
  }

  /**
   * Chooses which rows the review shows.
   *
   * @param filter The filter.
   */
  public pickFilter(filter: GenerateRowFilter): void {
    this._filter.set(filter);
    this._limit.set(PAGE_SIZE);
  }

  /**
   * Shows more rows.
   */
  public showMore(): void {
    this._limit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Displays the next chunk cells without changing the run's full progress.
   *
   * @public
   */
  public showMoreCells(): void {
    this._cellLimit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Takes what the user typed. Main validates it shortly after.
   *
   * @param key The key.
   * @param value The value.
   */
  public edit(key: string, value: string): void {
    const run = this._run();

    if (!run) {
      return;
    }

    const edit: IRowEdit = { runId: run.runId, locale: run.locale, key, value };
    const id = this.editKey(edit);

    this._edits.update((edits) => ({ ...edits, [id]: edit }));

    const waiting = this._editTimers.get(id);

    if (waiting) {
      clearTimeout(waiting);
    }

    this._editTimers.set(
      id,
      setTimeout(() => {
        this._editTimers.delete(id);
        void this.saveEdit(edit);
      }, EDIT_DELAY_MS),
    );
  }

  /**
   * Accepts or rejects a row.
   *
   * @param row The row.
   * @param accepted The new value.
   * @returns When main knows.
   */
  public async accept(
    row: Pick<GenerateRow, 'key' | 'accepted'>,
    accepted: boolean,
  ): Promise<void> {
    const run = this._run();

    if (run && row.accepted !== accepted) {
      await this.setRow({ runId: run.runId, locale: run.locale, key: row.key }, { accepted });
    }
  }

  /**
   * Writes the accepted rows of the open locale, as one change set.
   *
   * @returns When it is done.
   */
  public async write(): Promise<void> {
    const run = this._run();

    if (!run || this._busy() || this.writeBlocker() !== null) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);
    this._outcome.set(null);

    try {
      if (!(await this.flushEdits(run.runId, run.locale))) {
        return;
      }

      this._outcome.set(
        await this._api.request('generate.write', { runId: run.runId, locale: run.locale }),
      );
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
  private setRow(
    context: IRowContext,
    change: { value?: string; accepted?: boolean },
    edit?: IRowEdit,
  ): Promise<boolean> {
    const request = this._rowUpdates.then(async () => {
      try {
        await this._api.request('generate.setRow', { ...context, ...change });

        if (
          !this._destroyed &&
          context.runId === this._runId &&
          context.locale === (this._locale() ?? this._run()?.locale)
        ) {
          await this.fetch();

          if (this._error()) {
            this._message.set(this._error());

            return false;
          }
        }

        const id = this.editKey(context);

        if (edit && this._edits()[id] === edit) {
          this._edits.update(({ [id]: _done, ...others }) => others);
        }

        return true;
      } catch (error) {
        this._message.set(error instanceof Error ? error.message : String(error));

        return false;
      }
    });

    this._rowUpdates = request;
    this._rowRequests.set(request, context);
    void request.then(() => this._rowRequests.delete(request));

    return request;
  }

  /** Sends a draft only once while it is queued or in flight. */
  private saveEdit(edit: IRowEdit): Promise<boolean> {
    const existing = this._editRequests.get(edit);

    if (existing) {
      return existing;
    }

    const request = this.setRow(edit, { value: edit.value }, edit);

    this._editRequests.set(edit, request);
    void request.then(() => this._editRequests.delete(edit));

    return request;
  }

  /** Drains this context before writing or leaving it, retaining failed or newer drafts. */
  private async flushEdits(runId: string, locale?: string): Promise<boolean> {
    const belongs = (context: IRowContext): boolean =>
      context.runId === runId && (locale === undefined || context.locale === locale);

    for (;;) {
      const requests = new Set(
        [...this._rowRequests]
          .filter(([, context]) => belongs(context))
          .map(([request]) => request),
      );

      for (const edit of Object.values(this._edits()).filter(belongs)) {
        const id = this.editKey(edit);
        const timer = this._editTimers.get(id);

        if (timer) {
          clearTimeout(timer);
          this._editTimers.delete(id);
        }
        requests.add(this.saveEdit(edit));
      }

      if (requests.size === 0) {
        return true;
      }

      if ((await Promise.all(requests)).some((saved) => !saved)) {
        return false;
      }
    }
  }

  /** A key may occur in every locale and in several runs. */
  private editKey(context: IRowContext): string {
    return JSON.stringify([context.runId, context.locale, context.key]);
  }

  /**
   * Asks main how the run stands. Events can come faster than answers, so only the latest question counts.
   *
   * @private
   */
  private fetch(): Promise<void> {
    if (this._destroyed) {
      return Promise.resolve();
    }

    if (this._fetching) {
      this._fetchAgain = true;

      return this._fetching;
    }

    this._fetching = (async () => {
      do {
        this._fetchAgain = false;
        const runId = this._runId;
        const locale = this._locale();

        try {
          const run = await this._api.request('generate.get', { runId, locale });

          if (!this._destroyed && runId === this._runId && locale === this._locale()) {
            this._run.set(run);
            this._fetchedAt = Date.now();
            this._error.set(null);
          }
        } catch (error) {
          if (!this._destroyed && runId === this._runId && locale === this._locale()) {
            this._error.set(error instanceof Error ? error.message : String(error));
          }
        }
      } while (this._fetchAgain && !this._destroyed);
    })().finally(() => {
      this._fetching = null;
    });

    return this._fetching;
  }

  // #endregion
}
