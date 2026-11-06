// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import type { ActiveRun, IpcEvent, RunStartRequest } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '../ipc/DesktopApi';
import { ShellSession } from '../session/ShellSession';

// #endregion

/**
 * Follows the runs of the app. They live in main, so this is only what the renderer knows about them: a renderer that
 * reloads asks what is going on and listens again.
 */
@Injectable({ providedIn: 'root' })
export class RunCenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _session = inject(ShellSession);
  private readonly _active = signal<ReadonlyArray<ActiveRun>>([]);
  private readonly _finished = signal(0);
  private readonly _changes = signal(0);
  private readonly _batches = signal(0);
  private readonly _waiting = new Map<string, Array<() => void>>();
  private _connection: Promise<void> | null = null;

  // #endregion

  // #region Properties

  /**
   * Gets what is going on.
   *
   * @readonly
   */
  public readonly active = this._active.asReadonly();

  /**
   * Gets whether anything is going on.
   *
   * @readonly
   */
  public readonly isBusy = computed(() => this._active().length > 0);

  /**
   * Gets a number that grows with every run that ends, here or in another process, for views that show the history.
   *
   * @readonly
   */
  public readonly finished = this._finished.asReadonly();

  /**
   * Gets a number that grows when the review list changes.
   *
   * @readonly
   */
  public readonly changes = this._changes.asReadonly();

  /**
   * Gets a number that grows when a project of "Run on all projects" starts or ends.
   *
   * @readonly
   */
  public readonly batches = this._batches.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Starts following the runs, once.
   *
   * @returns When the renderer knows what is going on.
   */
  public connect(): Promise<void> {
    this._connection ??= this.subscribe();

    return this._connection;
  }

  /**
   * Starts a command.
   *
   * @param request The command.
   * @returns The run.
   */
  public async start(request: RunStartRequest): Promise<ActiveRun> {
    await this.connect();

    const run = await this._api.request('run.start', request);

    this.track(run);

    return run;
  }

  /**
   * Starts a stored run again.
   *
   * @param runId The stored run.
   * @returns The new run.
   */
  public async repeat(runId: string): Promise<ActiveRun> {
    await this.connect();

    const run = await this._api.request('run.repeat', { runId });

    this.track(run);

    return run;
  }

  /**
   * Cancels a run.
   *
   * @param runId The run.
   * @returns When main knows.
   */
  public async cancel(runId: string): Promise<void> {
    await this._api.request('run.cancel', { runId });
  }

  /**
   * Returns what is going on for a command of a project.
   *
   * @param projectId The project.
   * @param command The command.
   * @returns The run, or `null`.
   */
  public activeFor(projectId: string, command: string): ActiveRun | null {
    return (
      this._active().find((run) => run.projectId === projectId && run.command === command) ?? null
    );
  }

  /**
   * Waits until a run has ended.
   *
   * @param runId The run.
   * @returns When it ended. A run that is not going on anymore has ended.
   */
  public whenFinished(runId: string): Promise<void> {
    if (!this._active().some((run) => run.id === runId)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this._waiting.set(runId, [...(this._waiting.get(runId) ?? []), resolve]);
    });
  }

  /**
   * Takes note of a run that was started elsewhere.
   *
   * @param run The run.
   */
  public track(run: ActiveRun): void {
    this._active.update((runs) =>
      runs.some((candidate) => candidate.id === run.id) ? runs : [...runs, run],
    );
  }

  /**
   * @private
   */
  private async subscribe(): Promise<void> {
    this._api.onEvent((event) => {
      this.onEvent(event);
    });
    this._active.set(await this._api.request('run.active', {}));
  }

  /**
   * @private
   */
  private onEvent(event: IpcEvent): void {
    switch (event.type) {
      case 'run.started':
        this.track(event.run);
        break;
      case 'run.progress':
        this.patch(event.runId, {
          phase: event.phase,
          completed: event.completed,
          total: event.total,
          detail: event.detail,
        });
        break;
      case 'run.log':
        this._active.update((runs) =>
          runs.map((run) =>
            run.id === event.runId
              ? { ...run, log: [...run.log, ...event.lines].slice(-200) }
              : run,
          ),
        );
        break;
      case 'run.finished':
        this.finish(event.runId);
        break;
      case 'run.batchUpdated':
        this._batches.update((count) => count + 1);
        break;
      case 'runs.updated':
        this._finished.update((count) => count + 1);
        break;
      case 'changes.updated':
        this._changes.update((count) => count + 1);
        void this._session.refresh();
        break;
      case 'ai.providersChanged':
        void this._session.refresh();
        break;
      default:
        break;
    }
  }

  /**
   * @private
   */
  private patch(runId: string, change: Partial<ActiveRun>): void {
    this._active.update((runs) =>
      runs.map((run) => (run.id === runId ? { ...run, ...change } : run)),
    );
  }

  /**
   * @private
   */
  private finish(runId: string): void {
    this._active.update((runs) => runs.filter((run) => run.id !== runId));
    this._finished.update((count) => count + 1);

    for (const resolve of this._waiting.get(runId) ?? []) {
      resolve();
    }

    this._waiting.delete(runId);
  }

  // #endregion
}
