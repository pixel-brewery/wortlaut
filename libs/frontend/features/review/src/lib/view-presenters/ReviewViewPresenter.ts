// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { ReviewDetail, ReviewItem, RunCommandName, WriteOutcome, IpcResponse } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, countOf, DesktopApi, formatInstant, RunCenter, ShellSession, surfaceName } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

const FILE_PAGE_SIZE = 5;
const LIST_PAGE_SIZE = 50;
const FINDING_PAGE_SIZE = 100;

/**
 * The names of the commands that leave a change set.
 */
const COMMAND_NAMES: Partial<Record<RunCommandName, string>> = {
    'detect.apply': 'Hard-coded strings',
    'catalog.edit': 'Catalog edit',
    'config.set': 'Settings',
    init: 'Configuration file',
    sort: 'Sort keys',
    transform: 'Transform',
    generate: 'Translation',
    'translations.propose': 'Proposed translations',
    'rules.install': 'Add rule pack',
    'rules.update': 'Update rule pack',
    'rules.settings': 'Rule pack settings'
};

/**
 * Writes the name of a change set.
 *
 * @param item The change set.
 * @returns For example `Sort keys`.
 */
export function titleOf(item: Pick<ReviewItem, 'command'>): string {
    return COMMAND_NAMES[item.command] ?? item.command;
}

/**
 * Owns Review: the pending change sets of the open workspace, their diffs, and approving or discarding one. Applying writes
 * all of its files or none, and while Dry run is on it waits.
 */
@Injectable()
export class ReviewViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _recovered = signal<IpcResponse<'changes.recovered'>>([]);
    private readonly _shell = inject(ShellSession);
    private readonly _runs = inject(RunCenter);
    private readonly _selectedId = signal<string | null>(null);
    private readonly _filePage = signal(0);
    private readonly _listLimit = signal(LIST_PAGE_SIZE);
    private readonly _findingLimit = signal(FINDING_PAGE_SIZE);
    private readonly _message = signal<string | null>(null);
    private readonly _outcome = signal<WriteOutcome | null>(null);
    private readonly _busy = signal(false);
    private readonly _now = signal(new Date());

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ReviewViewPresenter` class.
     */
    public constructor() {
        // A run or another view may add to the list while it is open.
        effect(() => {
            this._runs.changes();

            untracked(() => {
                if (this.list.value() !== null) {
                    void this.reload();
                }
            });
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets what this start did about writes that a crash interrupted.
     *
     * @readonly
     */
    public readonly recovered = this._recovered.asReadonly();

    /**
     * Gets the pending change sets.
     *
     * @readonly
     */
    public readonly list = new AsyncValue<Array<ReviewItem>>(() => {
        const workspace = this._shell.workspace();

        if (!workspace) {
            throw new Error('No workspace is open.');
        }

        return this._api.request('changes.list', { workspaceId: workspace.id });
    });

    /**
     * Gets the selected change set with its diffs.
     *
     * @readonly
     */
    public readonly detail = new AsyncValue<ReviewDetail | null>(async () => {
        const id = this._selectedId();

        return id ? this._api.request('changes.get', { id, fileOffset: this._filePage() * FILE_PAGE_SIZE, fileLimit: FILE_PAGE_SIZE }) : null;
    });

    /**
     * The bounded visible portion of the pending queue.
     */
    public readonly items = computed(() => (this.list.value() ?? []).slice(0, this._listLimit()));

    /**
     * Whether more pending summaries can be shown.
     */
    public readonly hasMoreItems = computed(() => (this.list.value()?.length ?? 0) > this._listLimit());

    /**
     * The zero-based file preview page.
     */
    public readonly filePage = this._filePage.asReadonly();

    /**
     * The fixed number of file previews requested from main.
     */
    public readonly filePageSize = FILE_PAGE_SIZE;

    /**
     * The visible findings of the complete change set.
     */
    public readonly findings = computed(() => (this.detail.value()?.findings ?? []).slice(0, this._findingLimit()));

    /**
     * Whether more findings remain available.
     */
    public readonly hasMoreFindings = computed(() => (this.detail.value()?.findings.length ?? 0) > this._findingLimit());

    /**
     * Gets the selected change set.
     *
     * @readonly
     */
    public readonly selectedId = this._selectedId.asReadonly();

    /**
     * Gets why the last action failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets what the last approval wrote.
     *
     * @readonly
     */
    public readonly outcome = this._outcome.asReadonly();

    /**
     * Gets whether an action is going on.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets whether Dry run keeps a change set from being written.
     *
     * @readonly
     */
    public readonly dryRun = this._shell.dryRun;

    /**
     * Gets whether the displayed change set is ready to be discarded.
     *
     * @readonly
     */
    public readonly canDiscard = computed(() => !this._busy() && this.detail.status() === 'ready' && this.detail.value()?.id === this._selectedId());

    /**
     * Gets whether the selected change set can be written now.
     *
     * @readonly
     */
    public readonly canApply = computed(() => !this._busy() && !this.dryRun() && this.detail.status() === 'ready' && this.detail.value()?.id === this._selectedId() && (this.detail.value()?.conflicts.length ?? 1) === 0);

    /**
     * Gets the name of the selected change set.
     *
     * @readonly
     */
    public readonly title = computed(() => {
        const detail = this.detail.value();

        return detail ? titleOf(detail) : '';
    });

    /**
     * Gets the line below the title of the selected change set.
     *
     * @readonly
     */
    public readonly line = computed(() => {
        const detail = this.detail.value();

        return detail ? [detail.detail, this.whenOf(detail)].filter((part) => part).join(' · ') : '';
    });

    // #endregion

    // #region Methods

    /**
     * Loads the list and selects the newest change set.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await this._runs.connect();
        await this.reload();
        this._recovered.set(await this._api.request('changes.recovered', {}));
    }

    /**
     * Selects a change set.
     *
     * @param id The change set.
     * @returns When its diffs are loaded.
     */
    public async select(id: string): Promise<void> {
        this._selectedId.set(id);
        this._filePage.set(0);
        this._findingLimit.set(FINDING_PAGE_SIZE);
        this._message.set(null);
        await this.detail.reload();
    }

    /**
     * Replaces the displayed file previews with one fixed-size page.
     *
     * @param page The zero-based page selected by the paginator.
     */
    public async setFilePage(page: number): Promise<void> {
        const count = this.detail.value()?.fileCount ?? 0;
        const last = Math.max(0, Math.ceil(count / FILE_PAGE_SIZE) - 1);

        if (!Number.isInteger(page) || page < 0 || page > last || page === this._filePage()) {
            return;
        }

        this._filePage.set(page);
        await this.detail.reload();
    }

    /**
     * Shows the next portion of pending summaries.
     */
    public showMoreItems(): void {
        this._listLimit.update((limit) => limit + LIST_PAGE_SIZE);
    }

    /**
     * Shows the next portion of findings without changing the write scope.
     */
    public showMoreFindings(): void {
        this._findingLimit.update((limit) => limit + FINDING_PAGE_SIZE);
    }

    /**
     * Writes the selected change set: all of its files or none. A file that changed since it was built fails with its name.
     *
     * @returns When it is done.
     */
    public async approve(): Promise<void> {
        const id = this._selectedId();

        if (!id || !this.canApply()) {
            return;
        }

        await this.act(async () => {
            this._outcome.set(await this._api.request('changes.apply', { id }));
        });
    }

    /**
     * Drops the selected change set. Nothing is written.
     *
     * @returns When it is done.
     */
    public async discard(): Promise<void> {
        const id = this._selectedId();

        if (id && this.canDiscard()) {
            await this.act(async () => {
                await this._api.request('changes.discard', { id });
                this._outcome.set(null);
            });
        }
    }

    /**
     * Writes the name of a change set.
     *
     * @param item The change set.
     * @returns The name.
     */
    public titleOf(item: ReviewItem): string {
        return titleOf(item);
    }

    /**
     * Writes where and when a change set came from.
     *
     * @param item The change set.
     * @returns For example `shop · Desktop app · 2 min ago`.
     */
    public whenOf(item: ReviewItem): string {
        return [item.projectName, surfaceName(item.surface), formatInstant(item.createdAt, this._now())].filter((part) => part !== null).join(' · ');
    }

    /**
     * Writes how many files a change set holds.
     *
     * @param item The change set.
     * @returns For example `2 files`.
     */
    public filesOf(item: ReviewItem): string {
        return countOf(item.fileCount, 'file');
    }

    /**
     * @private
     */
    private async act(action: () => Promise<void>): Promise<void> {
        this._busy.set(true);
        this._message.set(null);

        try {
            await action();
            this._selectedId.set(null);
            await this.reload();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
            await this.reload();
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * @private
     */
    private async reload(): Promise<void> {
        this._now.set(new Date());
        await this.list.reload();

        const items = this.list.value() ?? [];

        if (!items.some((item) => item.id === this._selectedId())) {
            this._selectedId.set(items[0]?.id ?? null);
            this._filePage.set(0);
            this._findingLimit.set(FINDING_PAGE_SIZE);
        }

        const count = items.find((item) => item.id === this._selectedId())?.fileCount ?? 0;

        this._filePage.update((page) => Math.min(page, Math.max(0, Math.ceil(count / FILE_PAGE_SIZE) - 1)));

        await this.detail.reload();
    }

    // #endregion

}
