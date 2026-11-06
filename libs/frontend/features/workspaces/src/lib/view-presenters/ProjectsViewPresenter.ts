// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type {
  ProjectList,
  ProjectRow,
  ProjectState,
  RunAllCommand,
  RunBatch,
  RunBatchRow,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  bindShortcuts,
  countOf,
  DesktopApi,
  formatCount,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

const PAGE_SIZE = 100;

/**
 * The commands of "Run on all projects".
 */
const COMMANDS: ReadonlyArray<{ id: RunAllCommand; label: string }> = [
  { id: 'detect', label: 'Detect' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'transform', label: 'Transform' },
  { id: 'sort', label: 'Sort' },
  { id: 'generate', label: 'Generate' },
];

/**
 * Which rows the table shows.
 */
export type ProjectFilter = 'all' | 'attention';

/**
 * Writes the state badge of a project.
 *
 * @param state The state.
 * @returns The label and its variant.
 */
export function projectStateBadge(state: ProjectState): {
  label: string;
  variant: 'neutral' | 'success' | 'warning' | 'danger';
} {
  switch (state.kind) {
    case 'clean':
      return { label: 'Complete', variant: 'success' };
    case 'failing':
      return { label: `${countOf(state.rules, 'rule')} failing`, variant: 'warning' };
    case 'folder-missing':
      return { label: 'Folder is gone', variant: 'danger' };
    default:
      return { label: 'Not analyzed', variant: 'neutral' };
  }
}

/**
 * Writes the state of a project of Run on all projects.
 *
 * @param row The project.
 * @returns The label and its variant.
 */
export function batchBadge(row: Pick<RunBatchRow, 'state'>): {
  label: string;
  variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
} {
  switch (row.state) {
    case 'waiting':
      return { label: 'Waiting', variant: 'neutral' };
    case 'running':
      return { label: 'Running', variant: 'info' };
    case 'succeeded':
      return { label: 'Done', variant: 'success' };
    case 'stopped':
      return { label: 'Stopped', variant: 'warning' };
    default:
      return { label: 'Failed', variant: 'danger' };
  }
}

/**
 * Owns the Projects view. It closes the open project, since this view belongs to the workspace.
 */
@Injectable()
export class ProjectsViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _router = inject(Router);
  private readonly _shell = inject(ShellSession);
  private readonly _center = inject(RunCenter);
  private readonly _filter = signal<ProjectFilter>('all');
  private readonly _command = signal<RunAllCommand>('analyze');
  private readonly _search = signal({ text: '' });
  private readonly _message = signal<string | null>(null);
  private readonly _batch = signal<RunBatch | null>(null);
  private readonly _rowLimit = signal(PAGE_SIZE);
  private readonly _batchLimit = signal(PAGE_SIZE);
  private _seenFinished = 0;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ProjectsViewPresenter` class.
   */
  public constructor() {
    bindShortcuts({ run: () => this.runAll() });

    effect(() => {
      this._search();
      this._filter();
      this._rowLimit.set(PAGE_SIZE);
    });

    // A project of Run on all projects started or ended.
    effect(() => {
      this._center.batches();

      untracked(() => {
        void this.loadBatch();
      });
    });

    // A run that ends changes the state badge of its project.
    effect(() => {
      const finished = this._center.finished();

      untracked(() => {
        if (finished !== this._seenFinished) {
          this._seenFinished = finished;

          if (this._center.active().length === 0) {
            void this.list.reload();
          }
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the projects of the open workspace.
   *
   * @readonly
   */
  public readonly list = new AsyncValue<ProjectList>(async () => {
    const state = await this._api.request('shell.setProject', { projectId: null });

    await this._shell.refresh();

    if (!state.workspace) {
      throw new Error('No workspace is open.');
    }

    return this._api.request('project.list', { workspaceId: state.workspace.id });
  });

  /**
   * Gets the form of the text filter.
   *
   * @readonly
   */
  public readonly searchForm = form(this._search);

  /**
   * Gets which rows the table shows.
   *
   * @readonly
   */
  public readonly filter = this._filter.asReadonly();

  /**
   * Gets the commands with the picked one.
   *
   * @readonly
   */
  public readonly commands = computed(() =>
    COMMANDS.map((command) => ({ ...command, isChecked: command.id === this._command() })),
  );

  /**
   * Gets the label of the run button, which follows the picked command.
   *
   * @readonly
   */
  public readonly runLabel = computed(() => `Run ${this._command()}`);

  /**
   * Gets whether Run on all projects is going on.
   *
   * @readonly
   */
  public readonly isRunning = computed(() =>
    (this._batch()?.rows ?? []).some((row) => row.state === 'waiting' || row.state === 'running'),
  );

  /**
   * Gets whether the picked command can run.
   *
   * @readonly
   */
  public readonly canRun = computed(
    () => (this.list.value()?.rows.length ?? 0) > 0 && !this.isRunning(),
  );

  /**
   * Gets what the picked command does on every project.
   *
   * @readonly
   */
  public readonly runNote = computed(() =>
    this._command() === 'generate'
      ? 'Translates what each project is still missing, with the provider you set up, one project at a time. Each project gets one run.'
      : 'Runs on every project, a few at a time, with one run and one result each. A project that fails does not stop the others, and what they change becomes one change set per repository.',
  );

  /**
   * Gets the last Run on all projects, per project with how far it is.
   *
   * @readonly
   */
  public readonly batchRows = computed(() => {
    const active = this._center.active();

    return (this._batch()?.rows ?? []).map((row) => {
      const run = active.find((candidate) => candidate.id === row.runId) ?? null;

      return {
        ...row,
        badge: batchBadge(row),
        phase: row.state === 'running' ? (run?.phase ?? 'Starting') : null,
        completed: run?.completed ?? 0,
        total: run?.total ?? 0,
      };
    });
  });

  /**
   * The visible portion of batch results; progress and cancellation still cover the complete batch.
   */
  public readonly visibleBatchRows = computed(() => this.batchRows().slice(0, this._batchLimit()));

  /**
   * Whether more batch results can be shown.
   */
  public readonly hasMoreBatchRows = computed(() => this.batchRows().length > this._batchLimit());

  /**
   * Gets how far Run on all projects is, for the bar above its rows.
   *
   * @readonly
   */
  public readonly batchProgress = computed(() => {
    const rows = this._batch()?.rows ?? [];
    const finished = rows.filter(
      (row) => row.state !== 'waiting' && row.state !== 'running',
    ).length;
    const failed = rows.filter((row) => row.state === 'failed').length;

    return {
      finished,
      total: rows.length,
      text: `${formatCount(finished)} of ${countOf(rows.length, 'project')} finished${failed > 0 ? `, ${formatCount(failed)} failed` : ''}`,
    };
  });

  /**
   * Gets the command of the last Run on all projects.
   *
   * @readonly
   */
  public readonly batchTitle = computed(() => {
    const batch = this._batch();

    return batch
      ? `${COMMANDS.find((command) => command.id === batch.command)?.label ?? batch.command}${batch.dryRun ? ', dry run' : ''}`
      : '';
  });

  /**
   * Gets the line that does the same from a terminal, for an Nx workspace.
   *
   * @readonly
   */
  public readonly sameAs = computed(() => this.list.value()?.sameAs?.[this._command()] ?? null);

  /**
   * Gets the rows that the filters leave.
   *
   * @readonly
   */
  public readonly rows = computed<Array<ProjectRow>>(() => {
    const text = this._search().text.trim().toLocaleLowerCase('en');
    const attention = this._filter() === 'attention';

    return (this.list.value()?.rows ?? []).filter((row) => {
      const needsAttention = row.state.kind === 'failing' || row.state.kind === 'folder-missing';

      return (
        (!attention || needsAttention) &&
        (!text ||
          row.name.toLocaleLowerCase('en').includes(text) ||
          row.folder.toLocaleLowerCase('en').includes(text))
      );
    });
  });

  /**
   * The visible portion of the filtered project list.
   */
  public readonly visibleRows = computed(() => this.rows().slice(0, this._rowLimit()));

  /**
   * Whether more matching projects can be shown.
   */
  public readonly hasMoreRows = computed(() => this.rows().length > this._rowLimit());

  /**
   * Gets the line below the title.
   *
   * @readonly
   */
  public readonly subtitle = computed(() => {
    const list = this.list.value();

    if (!list) {
      return '';
    }

    const projects = list.nxTarget
      ? countOf(list.rows.length, 'Nx project')
      : countOf(list.rows.length, 'project');

    return `${projects}${list.nxTarget ? ` with the target ${list.nxTarget}` : ''} · ${countOf(list.totalKeys, 'key')} · found in ${list.folder}`;
  });

  /**
   * Gets the line below the table.
   *
   * @readonly
   */
  public readonly footer = computed(() => {
    const total = this.list.value()?.rows.length ?? 0;
    const shown = this.visibleRows().length;

    return shown === total
      ? countOf(total, 'project')
      : `${formatCount(shown)} of ${countOf(total, 'project')}`;
  });

  /**
   * Gets what went wrong with a folder or a project.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Shows the next portion of matching projects without narrowing Run on all projects.
   */
  public showMoreRows(): void {
    this._rowLimit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Shows the next portion of batch results.
   */
  public showMoreBatchRows(): void {
    this._batchLimit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Writes the keys of a row.
   *
   * @param row The row.
   * @returns The count, or a dash for a project that could not be read.
   */
  public keysOf(row: ProjectRow): string {
    return row.keys === null ? '–' : formatCount(row.keys);
  }

  /**
   * Writes the state badge of a row.
   *
   * @param row The row.
   * @returns The badge.
   */
  public stateOf(row: ProjectRow): ReturnType<typeof projectStateBadge> {
    return projectStateBadge(row.state);
  }

  /**
   * Runs the picked command on every project of the workspace, with one run per project.
   *
   * @returns When all of them started.
   */
  public async runAll(): Promise<void> {
    const list = this.list.value();

    if (!list || !this.canRun()) {
      return;
    }

    this._message.set(null);

    try {
      await this._center.connect();

      for (const run of await this._api.request('run.startAll', {
        workspaceId: list.workspace.id,
        command: this._command(),
      })) {
        this._center.track(run);
      }

      await this.loadBatch();
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Stops Run on all projects: what works stops at its next point, and what waits never starts.
   *
   * @returns When main knows.
   */
  public async cancelAll(): Promise<void> {
    const batch = this._batch();

    if (batch) {
      await this._api.request('run.cancelBatch', { batchId: batch.id });
    }
  }

  /**
   * Reads the last Run on all projects, which lives in main.
   *
   * @returns When it is read.
   */
  public async loadBatch(): Promise<void> {
    const workspaceId = this._shell.workspace()?.id;

    if (workspaceId) {
      this._batch.set(await this._api.request('run.batch', { workspaceId }));
    }
  }

  /**
   * Picks the command to run on all projects.
   *
   * @param id The command.
   */
  public pickCommand(id: RunAllCommand): void {
    this._command.set(id);
  }

  /**
   * Picks which rows the table shows.
   *
   * @param value The filter.
   */
  public pickFilter(value: ProjectFilter): void {
    this._filter.set(value);
  }

  /**
   * Opens a project.
   *
   * @param id The project.
   * @returns When it is done.
   */
  public async open(id: string): Promise<void> {
    await this._shell.setProject(id);
    await this._router.navigate(['/overview']);
  }

  /**
   * Opens the native dialog and goes on to Project setup for this workspace. A cancelled dialog stays here.
   *
   * @returns When it is done.
   */
  public async addProject(): Promise<void> {
    this._message.set(null);

    try {
      const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

      if (folder) {
        await this._router.navigate(['/setup'], {
          queryParams: { folder: folder.token, workspace: this._shell.workspace()?.id },
        });
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  // #endregion
}
