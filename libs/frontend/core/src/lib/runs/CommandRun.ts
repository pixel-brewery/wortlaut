// #region Imports

import { computed, signal, type Signal } from '@angular/core';
import type {
  ActiveRun,
  RunOutput,
  RunResult,
  RunStartRequest,
} from '@pixel-brewery/wortlaut-contracts';
import type { DesktopApi } from '../ipc/DesktopApi';
import type { RunCenter } from './RunCenter';

// #endregion

/**
 * The commands a view can start.
 */
export type ViewCommand = 'detect' | 'analyze' | 'transform' | 'sort';

/**
 * What a view knows about the run of its command: the one going on, or how the last one ended. It finds both again after a
 * reload, because the run lives in main.
 */
export class CommandRun<TCommand extends ViewCommand = ViewCommand> {
  // #region Fields

  private readonly _api: DesktopApi;
  private readonly _center: RunCenter;
  private readonly _command: TCommand;
  private readonly _runId = signal<string | null>(null);
  private readonly _result = signal<RunResult | null>(null);
  private readonly _error = signal<string | null>(null);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `CommandRun` class.
   *
   * @param api The IPC client.
   * @param center The runs of the app.
   * @param command The command.
   */
  public constructor(api: DesktopApi, center: RunCenter, command: TCommand) {
    this._api = api;
    this._center = center;
    this._command = command;
    this.active = computed(
      () => this._center.active().find((run) => run.id === this._runId()) ?? null,
    );
    this.isRunning = computed(() => this.active() !== null);
    this.result = this._result.asReadonly();
    this.error = this._error.asReadonly();
    this.output = computed(() => {
      const output = this._result()?.output;

      return output?.command === this._command
        ? (output as Extract<RunOutput, { command: TCommand }>)
        : null;
    });
    this.failure = computed(() => {
      const result = this._result();

      return this._error() ?? (result?.state === 'failed' ? result.failure : null);
    });
    this.wasStopped = computed(() => this._result()?.state === 'stopped');
  }

  // #endregion

  // #region Properties

  /**
   * Gets the run that is going on.
   *
   * @readonly
   */
  public readonly active: Signal<ActiveRun | null>;

  /**
   * Gets whether a run is going on.
   *
   * @readonly
   */
  public readonly isRunning: Signal<boolean>;

  /**
   * Gets how the last run ended.
   *
   * @readonly
   */
  public readonly result: Signal<RunResult | null>;

  /**
   * Gets what the last run could not start for.
   *
   * @readonly
   */
  public readonly error: Signal<string | null>;

  /**
   * Gets the output of the last run.
   *
   * @readonly
   */
  public readonly output: Signal<Extract<RunOutput, { command: TCommand }> | null>;

  /**
   * Gets why the last run failed.
   *
   * @readonly
   */
  public readonly failure: Signal<string | null>;

  /**
   * Gets whether the last run was stopped.
   *
   * @readonly
   */
  public readonly wasStopped: Signal<boolean>;

  // #endregion

  // #region Methods

  /**
   * Finds the run again after a reload: the one going on, or else the last result.
   *
   * @param projectId The project.
   * @returns When the view knows, and when a run that was going on has ended.
   */
  public async restore(projectId: string): Promise<void> {
    await this._center.connect();

    const active = this._center.activeFor(projectId, this._command);

    if (active) {
      await this.follow(active.id);

      return;
    }

    this._result.set(await this._api.request('run.latest', { projectId, command: this._command }));
  }

  /**
   * Starts the command and follows it.
   *
   * @param request The command.
   * @returns When it ended. It never rejects: a failure is a state.
   */
  public async start(request: RunStartRequest & { command: TCommand }): Promise<RunResult | null> {
    this._error.set(null);

    try {
      const run = await this._center.start(request);

      await this.follow(run.id);

      return this._result();
    } catch (error) {
      this._error.set(error instanceof Error ? error.message : String(error));

      return null;
    }
  }

  /**
   * Stops the run that is going on.
   *
   * @returns When main knows.
   */
  public async cancel(): Promise<void> {
    const runId = this._runId();

    if (runId) {
      await this._center.cancel(runId);
    }
  }

  /**
   * Forgets how the last run ended, for example after a change made it stale.
   */
  public clear(): void {
    this._result.set(null);
    this._error.set(null);
  }

  /**
   * @private
   */
  private async follow(runId: string): Promise<void> {
    this._runId.set(runId);
    await this._center.whenFinished(runId);
    this._result.set(await this._api.request('run.result', { runId }));
  }

  // #endregion
}
