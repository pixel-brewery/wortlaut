// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { OutputRow, TransformFormat, TransformOverview } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, bindShortcuts, CommandRun, countOf, DesktopApi, formatCount, RunCenter, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * What a file of a result says.
 *
 * @param state The state of the file.
 * @returns The label and its variant.
 */
export function describeState(state: OutputRow['state']): { label: string; variant: 'neutral' | 'info' | 'success' } {
    switch (state) {
        case 'written':
            return { label: 'Written', variant: 'success' };
        case 'unchanged':
            return { label: 'Unchanged, not written', variant: 'neutral' };
        default:
            return { label: 'Would be written', variant: 'info' };
    }
}

/**
 * Owns Transform and sort: the target formats, the order, both commands, and the preview of the file that is picked.
 */
@Injectable()
export class TransformViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _center = inject(RunCenter);
    private readonly _shell = inject(ShellSession);
    private readonly _types = signal<ReadonlySet<TransformFormat['id']>>(new Set());
    private readonly _order = signal<'asc' | 'desc'>('asc');
    private readonly _last = signal<'transform' | 'sort'>('transform');
    private readonly _pickedFile = signal<string | null>(null);

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `TransformViewPresenter` class.
     */
    public constructor() {
        bindShortcuts({ run: () => this.canTransform() ? this.transform() : undefined });
        // The lines that do the same follow the settings.
        effect(() => {
            this._types();
            this._order();

            untracked(() => {
                if (this.overview.value()) {
                    void this.sameAs.reload();
                }
            });
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the run of a transformation.
     *
     * @readonly
     */
    public readonly transformRun = new CommandRun(this._api, this._center, 'transform');

    /**
     * Gets the run of a sort.
     *
     * @readonly
     */
    public readonly sortRun = new CommandRun(this._api, this._center, 'sort');

    /**
     * Gets what the view shows before a run.
     *
     * @readonly
     */
    public readonly overview = new AsyncValue<TransformOverview>(() => this._api.request('transform.overview', { projectId: this.requireProject() }));

    /**
     * Gets the lines that do the same from a terminal.
     *
     * @readonly
     */
    public readonly sameAs = new AsyncValue<Array<string>>(async () => {
        const projectId = this.requireProject();
        const types = Array.from(this._types());
        const lines = await Promise.all([
            types.length > 0 ? this._api.request('run.print', { command: 'transform', projectId, input: { types } }) : null,
            this._api.request('run.print', { command: 'sort', projectId, input: { order: this._order() } })
        ]);

        return lines.flatMap((line) => line ? [line.command] : []);
    });

    /**
     * Gets the target formats with their state.
     *
     * @readonly
     */
    public readonly formats = computed(() => (this.overview.value()?.formats ?? []).map((format) => ({ ...format, isChecked: this._types().has(format.id) })));

    /**
     * Gets the label of the main button, whose count follows the checkboxes.
     *
     * @readonly
     */
    public readonly transformLabel = computed(() => `Transform ${countOf(this._types().size, 'format')}`);

    /**
     * Gets whether a transformation can start.
     *
     * @readonly
     */
    public readonly canTransform = computed(() => this._types().size > 0 && !this.isRunning());

    /**
     * Gets whether a command is going on.
     *
     * @readonly
     */
    public readonly isRunning = computed(() => this.transformRun.isRunning() || this.sortRun.isRunning());

    /**
     * Gets the run that is going on.
     *
     * @readonly
     */
    public readonly active = computed(() => this.transformRun.active() ?? this.sortRun.active());

    /**
     * Gets the order to sort in.
     *
     * @readonly
     */
    public readonly order = this._order.asReadonly();

    /**
     * Gets what the sort covers.
     *
     * @readonly
     */
    public readonly sortNote = computed(() => {
        const overview = this.overview.value();

        return overview ? `${countOf(overview.keyCount, 'key')} in ${countOf(overview.fileCount, 'file')}` : '';
    });

    /**
     * Gets the run whose result shows.
     *
     * @readonly
     */
    public readonly shown = computed(() => this._last() === 'sort' ? this.sortRun : this.transformRun);

    /**
     * Gets the title of the result, which says so while Dry run is on.
     *
     * @readonly
     */
    public readonly resultTitle = computed(() => this.shown().result()?.dryRun ?? this._shell.dryRun() ? 'Result of the dry run' : 'Result');

    /**
     * Gets the rows of the result.
     *
     * @readonly
     */
    public readonly rows = computed(() => (this.shown().output()?.rows ?? []).map((row) => ({
        ...row,
        keysLabel: formatCount(row.keys),
        badge: describeState(row.state),
        isSelected: row.file === this.selectedFile()?.file
    })));

    /**
     * Gets the file of the preview: the one picked, or the first that changes.
     *
     * @readonly
     */
    public readonly selectedFile = computed(() => {
        const rows = this.shown().output()?.rows ?? [];

        return rows.find((row) => row.file === this._pickedFile()) ?? rows.find((row) => row.state !== 'unchanged') ?? rows[0] ?? null;
    });

    /**
     * Gets what the last command wrote or left for review.
     *
     * @readonly
     */
    public readonly outcome = computed(() => this.shown().result()?.outcome ?? null);

    // #endregion

    // #region Methods

    /**
     * Loads the view, and finds what went on or ended before a reload.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await this.overview.reload();

        const overview = this.overview.value();

        if (overview) {
            this._types.set(new Set(overview.formats.filter((format) => format.enabled).map((format) => format.id)));
            this._order.set(overview.order);
            await this.sameAs.reload();

            const projectId = this.requireProject();

            await Promise.all([this.transformRun.restore(projectId), this.sortRun.restore(projectId)]);

            if (this.sortRun.output() && !this.transformRun.output()) {
                this._last.set('sort');
            }
        }
    }

    /**
     * Sets whether a format is a target. Setting what is already set changes nothing, because a checkbox also reports the
     * state it was bound to.
     *
     * @param id The format.
     * @param isChecked Whether it is a target.
     */
    public setFormat(id: TransformFormat['id'], isChecked: boolean): void {
        if (this._types().has(id) !== isChecked) {
            const next = new Set(this._types());

            if (isChecked) {
                next.add(id);
            } else {
                next.delete(id);
            }

            this._types.set(next);
        }
    }

    /**
     * Sets the order.
     *
     * @param order The order.
     */
    public setOrder(order: 'asc' | 'desc'): void {
        this._order.set(order);
    }

    /**
     * Converts the catalogs into the target formats.
     *
     * @returns When it ended.
     */
    public async transform(): Promise<void> {
        this._last.set('transform');
        this._pickedFile.set(null);
        await this.transformRun.start({ command: 'transform', projectId: this.requireProject(), input: { types: Array.from(this._types()) } });
        await this.overview.reload();
    }

    /**
     * Sorts the keys of the catalogs.
     *
     * @returns When it ended.
     */
    public async sort(): Promise<void> {
        this._last.set('sort');
        this._pickedFile.set(null);
        await this.sortRun.start({ command: 'sort', projectId: this.requireProject(), input: { order: this._order() } });
        await this.overview.reload();
    }

    /**
     * Shows a file in the preview.
     *
     * @param file The file.
     */
    public pick(file: string): void {
        this._pickedFile.set(file);
    }

    /**
     * @private
     */
    private requireProject(): string {
        const project = this._shell.project();

        if (!project) {
            throw new Error('No project is open.');
        }

        return project.id;
    }

    // #endregion

}
