// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { ReviewDetail, ReviewItem, RunCommandName, WriteOutcome, IpcResponse } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, countOf, DesktopApi, formatInstant, RunCenter, ShellSession, surfaceName } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

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

        return id ? this._api.request('changes.get', { id }) : null;
    });

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
     * Gets whether the selected change set can be written now.
     *
     * @readonly
     */
    public readonly canApply = computed(() => !this._busy() && !this.dryRun() && (this.detail.value()?.conflicts.length ?? 1) === 0);

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
        this._message.set(null);
        await this.detail.reload();
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

        if (id) {
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
        }

        await this.detail.reload();
    }

    // #endregion

}
