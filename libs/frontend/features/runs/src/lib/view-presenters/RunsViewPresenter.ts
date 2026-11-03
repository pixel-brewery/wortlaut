// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { RunChange, RunDetail, RunSummary } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, DesktopApi, formatDuration, formatInstant, RunCenter, ShellSession, surfaceName } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The tab of the details.
 */
export type RunTab = 'log' | 'changes' | 'configuration';

/**
 * How long Copy command says so.
 */
const COPIED_MS = 2000;

/**
 * Commands that never change a file, whatever mode they run in.
 */
const READ_ONLY_COMMANDS = new Set(['analyze', 'detect', 'info', 'mcp.read']);

/**
 * Says how a run dealt with its changes.
 *
 * @param run The run.
 * @returns The tag, or `null` for a run that wrote what it had.
 */
export function runModeTag(run: Pick<RunSummary, 'dryRun' | 'forReview'>): string | null {
    if (run.dryRun) {
        return 'dry run';
    }

    return run.forReview ? 'for review' : null;
}

/**
 * Writes the state badge of a run.
 *
 * @param run The run.
 * @returns The label and its variant.
 */
export function runStateBadge(run: Pick<RunSummary, 'state' | 'failedRules'>): { label: string; variant: 'success' | 'warning' | 'danger' } {
    switch (run.state) {
        case 'failed':
            return { label: 'Failed', variant: 'danger' };
        case 'stopped':
            return { label: 'Stopped', variant: 'danger' };
        default:
            return run.failedRules > 0
                ? { label: `${run.failedRules} ${run.failedRules === 1 ? 'rule' : 'rules'} failed`, variant: 'warning' }
                : { label: 'Done', variant: 'success' };
    }
}

/**
 * Writes what happened to a file of a run.
 *
 * @param change The change.
 * @returns For example `Written` or `Waiting for review`.
 */
export function describeChange(change: RunChange): string {
    switch (change.state) {
        case 'applied':
            return change.action === 'create' ? 'Created' : 'Written';
        case 'pending':
            return 'Waiting for review';
        case 'discarded':
            return 'Discarded';
        default:
            return 'Would be written';
    }
}

/**
 * Says why a run has no files.
 *
 * @param run The run.
 * @returns The reason.
 */
export function noChangesReason(run: Pick<RunDetail, 'command' | 'dryRun' | 'state'>): string {
    if (READ_ONLY_COMMANDS.has(run.command)) {
        return run.command === 'mcp.read' ? 'This tool only reads.' : `${run.command} never changes files.`;
    }

    if (run.state !== 'succeeded') {
        return 'The run ended before anything could be written.';
    }

    return run.dryRun ? 'A dry run writes nothing.' : 'Nothing needed to change.';
}

/**
 * Owns the Runs view: the history of the open project and the details of the selected run.
 */
@Injectable()
export class RunsViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _center = inject(RunCenter);
    private readonly _selectedId = signal<string | null>(this._route.snapshot.paramMap.get('runId'));
    private readonly _tab = signal<RunTab>('log');
    private readonly _copied = signal(false);
    private readonly _now = signal(new Date());
    private readonly _message = signal<string | null>(null);
    private _seenFinished = 0;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RunsViewPresenter` class.
     */
    public constructor() {
        // A run that ends joins the history, with its log and its changes.
        effect(() => {
            const finished = this._center.finished();

            untracked(() => {
                if (finished !== this._seenFinished) {
                    this._seenFinished = finished;
                    void this.load();
                }
            });
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the runs of the open project, or of every project while none is open, as All runs of MCP and plugins shows them.
     *
     * @readonly
     */
    public readonly runs = new AsyncValue<Array<RunSummary>>(() => this._api.request('run.list', { projectId: this._shell.project()?.id ?? null, limit: null }));

    /**
     * Gets the details of the selected run.
     *
     * @readonly
     */
    public readonly detail = new AsyncValue<RunDetail | null>(async () => {
        const id = this._selectedId();

        return id ? this._api.request('run.get', { runId: id }) : null;
    });

    /**
     * Gets the runs of the open project that are going on.
     *
     * @readonly
     */
    public readonly active = computed(() => {
        const project = this._shell.project();

        return this._center.active().filter((run) => run.projectId === project?.id);
    });

    /**
     * Gets why Run again failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets the selected run.
     *
     * @readonly
     */
    public readonly selectedId = this._selectedId.asReadonly();

    /**
     * Gets the open tab.
     *
     * @readonly
     */
    public readonly tab = this._tab.asReadonly();

    /**
     * Gets whether the command was just copied.
     *
     * @readonly
     */
    public readonly copied = this._copied.asReadonly();

    /**
     * Gets the line below the title of the details.
     *
     * @readonly
     */
    public readonly detailLine = computed(() => {
        const run = this.detail.value();

        return run ? [this.whenOf(run), formatDuration(run.durationMs), run.detail].filter((part) => part.length > 0).join(' · ') : '';
    });

    /**
     * Gets the text of the open tab, when it shows text.
     *
     * @readonly
     */
    public readonly code = computed(() => {
        const run = this.detail.value();

        if (!run) {
            return '';
        }

        if (this._tab() === 'configuration') {
            return run.configuration;
        }

        const dropped = run.droppedLogEntries > 0 ? `${run.droppedLogEntries} earlier log entries were dropped.\n` : '';

        return `${dropped}${run.log}${run.failure ? `\n${run.failure}` : ''}` || 'This run logged nothing.';
    });

    /**
     * Gets the files of the selected run.
     *
     * @readonly
     */
    public readonly changes = computed(() => (this.detail.value()?.changes ?? []).map((change) => ({ file: change.file, text: describeChange(change) })));

    /**
     * Gets why the selected run has no files.
     *
     * @readonly
     */
    public readonly noChanges = computed(() => {
        const run = this.detail.value();

        return run ? noChangesReason(run) : '';
    });

    // #endregion

    // #region Methods

    /**
     * Loads the history and selects the newest run when none is named.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await this._center.connect();
        this._seenFinished = this._center.finished();
        this._now.set(new Date());
        await this.runs.reload();

        const runs = this.runs.value() ?? [];

        if (!this._selectedId() && runs.length > 0) {
            this._selectedId.set(runs[0].id);
        }

        await this.detail.reload();
    }

    /**
     * Selects a run.
     *
     * @param id The run.
     * @returns When its details are loaded.
     */
    public async select(id: string): Promise<void> {
        this._selectedId.set(id);
        await this._router.navigate(['/runs', id]);
        await this.detail.reload();
    }

    /**
     * Opens a tab.
     *
     * @param tab The tab.
     */
    public openTab(tab: RunTab): void {
        this._tab.set(tab);
    }

    /**
     * Copies the equivalent command, which holds no secrets.
     *
     * @returns When it is copied.
     */
    public async copyCommand(): Promise<void> {
        const run = this.detail.value();

        if (run) {
            await this._api.request('clipboard.writeText', { text: run.equivalentCommand });
            this._copied.set(true);
            setTimeout(() => {
                this._copied.set(false);
            }, COPIED_MS);
        }
    }

    /**
     * Starts a run again from its stored options, under the current dry run.
     *
     * @returns When it started. The new run is selected when it has ended.
     */
    public async runAgain(): Promise<void> {
        const run = this.detail.value();

        if (run) {
            this._message.set(null);

            try {
                const started = await this._center.repeat(run.id);

                void this._center.whenFinished(started.id).then(() => this.select(started.id));
            } catch (error) {
                this._message.set(error instanceof Error ? error.message : String(error));
            }
        }
    }

    /**
     * Stops a run that is going on.
     *
     * @param runId The run.
     * @returns When main knows.
     */
    public async cancel(runId: string): Promise<void> {
        await this._center.cancel(runId);
    }

    /**
     * Writes the state badge of a run.
     *
     * @param run The run.
     * @returns The badge.
     */
    public badgeOf(run: RunSummary): ReturnType<typeof runStateBadge> {
        return runStateBadge(run);
    }

    /**
     * Writes where and when a run happened.
     *
     * @param run The run.
     * @returns For example `Desktop app · dry run · 2 min ago`.
     */
    public whenOf(run: RunSummary): string {
        return [surfaceName(run.surface, run.client), runModeTag(run), formatInstant(run.startedAt, this._now())].filter((part) => part !== null).join(' · ');
    }

    // #endregion

}
