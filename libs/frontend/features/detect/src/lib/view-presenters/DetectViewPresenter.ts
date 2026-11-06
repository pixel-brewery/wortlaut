// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import type {
  DetectHint,
  DetectRow,
  DetectSettings,
  RunStartRequest,
  WriteOutcome,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  bindShortcuts,
  CommandRun,
  DesktopApi,
  formatCount,
  formatName,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many rows the table shows at first.
 */
const PAGE_SIZE = 200;

/**
 * How many rows one request for names covers.
 */
const MAX_NAMED_ROWS = 200;

/**
 * The keys a user can give a string.
 */
const VALID_KEY = /^[\p{L}\p{N}_.-]+$/u;

/**
 * Writes the hint of a row.
 *
 * @param hint The hint.
 * @returns For example `Reuse loc.nav.home`.
 */
export function describeHint(hint: DetectHint): string {
  switch (hint.kind) {
    case 'reuse':
      return `Reuse ${hint.key}`;
    case 'test':
      return 'Test file';
    case 'placeholder':
      return 'Holds a placeholder';
    default:
      return 'New key';
  }
}

/**
 * Owns Detect: the settings of a scan, the run, and what becomes of its rows. The scan and the rewrite live in main; this
 * holds only which row is selected, what the user named and what was ignored.
 */
@Injectable()
export class DetectViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _model = signal({ preset: '', suffix: '' });
  private readonly _skipTests = signal(true);
  private readonly _limit = signal(PAGE_SIZE);
  private readonly _selectedId = signal<string | null>(null);
  private readonly _ignored = signal<ReadonlySet<string>>(new Set());
  private readonly _waiting = signal<ReadonlySet<string>>(new Set());
  private readonly _names = signal<Readonly<Record<string, string>>>({});
  private readonly _outcome = signal<WriteOutcome | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _isNaming = signal(false);
  private readonly _aiNote = signal<{
    variant: 'info' | 'warning';
    header: string;
    content: string;
  } | null>(null);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `DetectViewPresenter` class.
   */
  public constructor() {
    bindShortcuts({
      run: () => (this.run.isRunning() || !this._model().preset ? undefined : this.scan()),
      suggest: () => (this.canNameKeys() ? this.nameKeysWithAi() : undefined),
      next: () => {
        this.selectNext();
      },
    });

    // The line that does the same follows the settings.
    effect(() => {
      this._model();
      this._skipTests();

      untracked(() => {
        if (this.settings.value()) {
          void this.sameAs.reload();
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the run of a scan.
   *
   * @readonly
   */
  public readonly run = new CommandRun(inject(DesktopApi), inject(RunCenter), 'detect');

  /**
   * Gets what the settings start from.
   *
   * @readonly
   */
  public readonly settings = new AsyncValue<DetectSettings>(() =>
    this._api.request('detect.settings', { projectId: this.requireProject() }),
  );

  /**
   * Gets the command line that does the same.
   *
   * @readonly
   */
  public readonly sameAs = new AsyncValue<string>(
    async () => (await this._api.request('run.print', this.createRequest())).command,
  );

  /**
   * Gets the form of the settings of this scan.
   *
   * @readonly
   */
  public readonly form = form(this._model);

  /**
   * Gets whether test files stay out of the scan.
   *
   * @readonly
   */
  public readonly skipTests = this._skipTests.asReadonly();

  /**
   * Gets the presets as the select shows them, with the file types the engine reads.
   *
   * @readonly
   */
  public readonly presets = computed(() =>
    (this.settings.value()?.presets ?? []).map((preset) => ({
      id: preset.id,
      label: `${preset.name} (${preset.extensions.join(', ')})`,
    })),
  );

  /**
   * Gets the format of the catalog that new keys go to.
   *
   * @readonly
   */
  public readonly format = computed(() => this.settings.value()?.format ?? 'json');

  /**
   * Gets the name of that format.
   *
   * @readonly
   */
  public readonly formatLabel = computed(() => formatName(this.format()));

  /**
   * Gets the figures of the scan.
   *
   * @readonly
   */
  public readonly figures = computed(() => {
    const scan = this.run.output()?.scan;
    const value = (count: number | undefined): string =>
      count === undefined ? '–' : formatCount(count);

    return [
      { label: 'Files scanned', value: value(scan?.filesScanned) },
      { label: 'Strings found', value: value(scan?.stringsFound) },
      { label: 'Already keys', value: value(scan?.alreadyKeys) },
      { label: 'Hard-coded', value: value(scan?.hardCoded) },
    ];
  });

  /**
   * Gets whether a scan has a result to show.
   *
   * @readonly
   */
  public readonly hasScan = computed(() => this.run.output() !== null);

  /**
   * Gets the rows of the table: what the scan found, without what was ignored, with the keys the user named.
   *
   * @readonly
   */
  public readonly rows = computed(() => {
    const ignored = this._ignored();
    const waiting = this._waiting();

    return (this.run.output()?.scan.rows ?? [])
      .filter((row) => !ignored.has(row.id))
      .slice(0, this._limit())
      .map((row) => ({
        ...row,
        key: this._names()[row.id] ?? row.key,
        hintText: waiting.has(row.id) ? 'Waiting in Review' : describeHint(row.hint),
        isSelected: row.id === this.selectedRow()?.id,
      }));
  });

  /**
   * Gets whether more rows can show.
   *
   * @readonly
   */
  public readonly hasMoreRows = computed(
    () => (this.run.output()?.scan.rows.length ?? 0) - this._ignored().size > this._limit(),
  );

  /**
   * Gets what the table says about strings beyond the rows of this scan.
   *
   * @readonly
   */
  public readonly boundNote = computed(() => {
    const scan = this.run.output()?.scan;

    return scan && scan.rows.length < scan.hardCoded
      ? `This scan lists the first ${formatCount(scan.rows.length)} of ${formatCount(scan.hardCoded)} strings. Apply them and scan again for the rest.`
      : null;
  });

  /**
   * Gets the selected row, the first one until one is picked.
   *
   * @readonly
   */
  public readonly selectedRow = computed<DetectRow | null>(() => {
    const ignored = this._ignored();
    const rows = (this.run.output()?.scan.rows ?? []).filter((row) => !ignored.has(row.id));

    return rows.find((row) => row.id === this._selectedId()) ?? rows[0] ?? null;
  });

  /**
   * Gets the key the selected row would get.
   *
   * @readonly
   */
  public readonly selectedKey = computed(() => {
    const row = this.selectedRow();

    return row ? (this._names()[row.id] ?? row.key) : '';
  });

  /**
   * Gets what the selected key lacks.
   *
   * @readonly
   */
  public readonly keyError = computed(() => {
    const row = this.selectedRow();
    const key = this.selectedKey();

    return row?.canApply && !VALID_KEY.test(key)
      ? 'A key holds letters, digits, dots, dashes and underscores.'
      : null;
  });

  /**
   * Gets the line of the selected row as it would become.
   *
   * @readonly
   */
  public readonly selectedAfter = computed(() => {
    const row = this.selectedRow();

    if (!row) {
      return '';
    }

    return row.around ? `${row.around.head}${this.selectedKey()}${row.around.tail}` : row.after;
  });

  /**
   * Gets whether the selected row can be applied now.
   *
   * @readonly
   */
  public readonly canApply = computed(() => {
    const row = this.selectedRow();

    return (
      row !== null &&
      row.canApply &&
      this.keyError() === null &&
      !this._busy() &&
      !this._waiting().has(row.id)
    );
  });

  /**
   * Gets the rows Apply all would change.
   *
   * @readonly
   */
  public readonly canApplyAll = computed(() => !this._busy() && this.applicableRows().length > 0);

  /**
   * Gets whether AI can name the keys of this scan.
   *
   * @readonly
   */
  public readonly canNameKeys = computed(
    () => !this._busy() && !this._isNaming() && this.applicableRows().length > 0,
  );

  /**
   * Gets whether names are on their way.
   *
   * @readonly
   */
  public readonly isNaming = this._isNaming.asReadonly();

  /**
   * Gets what became of the last request for names.
   *
   * @readonly
   */
  public readonly aiNote = this._aiNote.asReadonly();

  /**
   * Gets what the last apply did.
   *
   * @readonly
   */
  public readonly outcome = this._outcome.asReadonly();

  /**
   * Gets why the last apply failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  /**
   * Gets whether an apply is going on.
   *
   * @readonly
   */
  public readonly busy = this._busy.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Loads the view, and finds a scan that went on or ended before a reload.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    await this.settings.reload();

    const settings = this.settings.value();

    if (settings) {
      this._model.set({
        preset: settings.preset ?? settings.presets[0]?.id ?? '',
        suffix: settings.suffix,
      });
      await this.sameAs.reload();
      await this.run.restore(this.requireProject());
    }
  }

  /**
   * Scans the project.
   *
   * @returns When the scan ended.
   */
  public async scan(): Promise<void> {
    this._message.set(null);
    this._outcome.set(null);
    await this.startScan();
  }

  /**
   * Sets whether test files stay out of the scan.
   *
   * @param skipTests The new value.
   */
  public setSkipTests(skipTests: boolean): void {
    this._skipTests.set(skipTests);
  }

  /**
   * Shows more rows.
   */
  public showMore(): void {
    this._limit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Selects a row.
   *
   * @param id The row.
   */
  public select(id: string): void {
    this._selectedId.set(id);
  }

  /**
   * Names the key of the selected row.
   *
   * @param key The key.
   */
  public nameKey(key: string): void {
    const row = this.selectedRow();

    if (row) {
      this._names.update((names) => ({ ...names, [row.id]: key.trim() }));
    }
  }

  /**
   * Removes the selected row from this scan.
   */
  public ignore(): void {
    const row = this.selectedRow();

    if (row) {
      this._ignored.update((ignored) => new Set([...ignored, row.id]));
      this._selectedId.set(null);
    }
  }

  /**
   * Moves on to the next string that is still open, and back to the first after the last.
   */
  public selectNext(): void {
    const rows = this.rows();
    const current = rows.findIndex((row) => row.isSelected);
    const next = rows[current + 1] ?? rows[0];

    if (next) {
      this.select(next.id);
    }
  }

  /**
   * Replaces the generated keys with proposals. They stay proposals: the rows show them, and nothing is written until they are
   * applied.
   *
   * @returns When the answer is there.
   */
  public async nameKeysWithAi(): Promise<void> {
    const scan = this.run.output()?.scan;
    const rows = this.applicableRows().slice(0, MAX_NAMED_ROWS);

    if (!scan || rows.length === 0) {
      return;
    }

    this._isNaming.set(true);
    this._aiNote.set(null);

    try {
      const { names, providerName, dropped } = await this._api.request('ai.nameKeys', {
        requestId: crypto.randomUUID(),
        projectId: this.requireProject(),
        scanId: scan.scanId,
        rowIds: rows.map((row) => row.id),
      });

      this._names.update((current) => ({
        ...current,
        ...Object.fromEntries(names.map(({ rowId, key }) => [rowId, key])),
      }));
      this._aiNote.set({
        variant: dropped.length > 0 ? 'warning' : 'info',
        header: `${providerName} named ${formatCount(names.length)} keys`,
        content: `These are proposals: nothing is written until you apply them.${dropped.length > 0 ? ` ${dropped.join(' ')}` : ''}`,
      });
    } catch (error) {
      this._aiNote.set({
        variant: 'warning',
        header: 'No names were proposed',
        content: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this._isNaming.set(false);
    }
  }

  /**
   * Applies the selected row to the source and the catalog, as one change set.
   *
   * @returns When it is done.
   */
  public async applySelected(): Promise<void> {
    const row = this.selectedRow();

    if (row && this.canApply()) {
      await this.apply([row]);
    }
  }

  /**
   * Applies every row that can be applied, as one change set.
   *
   * @returns When it is done.
   */
  public async applyAll(): Promise<void> {
    const rows = this.applicableRows();

    if (rows.length > 0) {
      await this.apply(rows);
    }
  }

  /**
   * @private
   */
  private applicableRows(): Array<DetectRow> {
    const ignored = this._ignored();
    const waiting = this._waiting();

    return (this.run.output()?.scan.rows ?? []).filter(
      (row) =>
        row.canApply &&
        !ignored.has(row.id) &&
        !waiting.has(row.id) &&
        VALID_KEY.test(this._names()[row.id] ?? row.key),
    );
  }

  /**
   * @private
   */
  private async apply(rows: ReadonlyArray<DetectRow>): Promise<void> {
    const scan = this.run.output()?.scan;

    if (!scan) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      const outcome = await this._api.request('detect.apply', {
        projectId: this.requireProject(),
        scanId: scan.scanId,
        rows: rows.map((row) => ({ rowId: row.id, key: this._names()[row.id] ?? row.key })),
      });

      this._outcome.set(outcome);

      if (outcome.state === 'applied') {
        // The files changed, so what the scan knows about them is over.
        await this.startScan();
      } else {
        this._waiting.update((waiting) => new Set([...waiting, ...rows.map((row) => row.id)]));
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * @private
   */
  private async startScan(): Promise<void> {
    this._ignored.set(new Set());
    this._waiting.set(new Set());
    this._names.set({});
    this._selectedId.set(null);
    this._limit.set(PAGE_SIZE);
    await this.run.start(this.createRequest() as RunStartRequest & { command: 'detect' });
  }

  /**
   * @private
   */
  private createRequest(): RunStartRequest {
    const { preset, suffix } = this._model();

    return {
      command: 'detect',
      projectId: this.requireProject(),
      input: {
        preset: (preset || null) as DetectSettings['preset'],
        suffix,
        skipTests: this._skipTests(),
      },
    };
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
