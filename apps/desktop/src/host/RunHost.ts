// #region Imports

import type {
  ActiveRun,
  IpcEvent,
  RunBatch,
  RunBatchRow,
  RunRecord,
  RunResult,
  RunStartRequest,
} from '@pixel-brewery/wortlaut-contracts';
import {
  createSortableId,
  EngineError,
  type IBatchChange,
  type IBatchWrite,
  type IRunHosting,
} from '@pixel-brewery/wortlaut-engine';

// #endregion

/**
 * The most results that stay around for a view that reloads.
 */
const MAX_RESULTS = 256;

/**
 * How many projects of "Run on all projects" work at the same time. They read files and take turns on one thread, so more of them
 * would not finish sooner.
 */
const MAX_PARALLEL_RUNS = 4;

/**
 * How many projects translate at the same time. Each one costs real tokens and holds a local assistant.
 */
const MAX_PARALLEL_TRANSLATIONS = 1;

/**
 * The most lines of its log that a live run keeps for a view that opens later.
 */
const MAX_LOG_LINES = 200;

/**
 * The shortest time between two progress events of a run.
 */
const PROGRESS_INTERVAL_MS = 50;

/**
 * The commands that run from their configuration.
 */
type ConfiguredCommand = 'detect' | 'analyze' | 'transform' | 'sort' | 'generate';

/**
 * The commands a host can run.
 */
type HostedCommand = RunStartRequest['command'];

/**
 * What runs the commands.
 *
 * @public
 */
export interface IRunCommands {
  run(request: RunStartRequest, hosting: IRunHosting): Promise<RunResult>;
  runConfigured(
    projectId: string,
    command: ConfiguredCommand,
    hosting: IRunHosting,
  ): Promise<RunResult>;
  repeat(record: RunRecord, projectId: string, hosting: IRunHosting): Promise<RunResult>;

  /**
   * Writes what the runs of a batch collected, one change set per repository.
   */
  writeBatch(changes: ReadonlyArray<IBatchChange>, wasStopped: boolean): Array<IBatchWrite>;
}

/**
 * What a run host is composed of.
 *
 * @public
 */
export interface IRunHostInit {
  commands: IRunCommands;
  publish: (event: IpcEvent) => void;
  projectName: (projectId: string) => string;

  /**
   * What every run gets from Settings: application, read when it starts.
   */
  hosting?: () => Pick<IRunHosting, 'cache' | 'verbose'>;

  /**
   * Turns paths in a line of a log into display values, because the line goes to the renderer.
   */
  scrub?: (text: string) => string;

  now?: () => Date;
}

/**
 * A run that is going on.
 */
interface IHostedRun {
  run: ActiveRun;
  controller: AbortController;
  done: Promise<void>;
  lastProgress: number;
}

/**
 * Lets a bounded number of runs of a batch work at the same time.
 */
class Slots {
  private _free: number;
  private readonly _waiting: Array<() => void>;

  public constructor(count: number) {
    this._free = count;
    this._waiting = [];
  }

  public acquire(): Promise<void> {
    if (this._free > 0) {
      this._free--;

      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this._waiting.push(resolve);
    });
  }

  public release(): void {
    const next = this._waiting.shift();

    if (next) {
      next();
    } else {
      this._free++;
    }
  }
}

/**
 * Hosts the runs started from the app. They live in the main process, so a reload of the renderer does not end them: it asks
 * what is going on, and listens again. A run keeps the dry run it started with, and stopping waits until it has stopped.
 *
 * @public
 */
export class RunHost {
  // #region Fields

  private readonly _init: IRunHostInit;
  private readonly _active: Map<string, IHostedRun>;
  private readonly _results: Map<string, RunResult>;
  private readonly _latest: Map<string, string>;
  private readonly _batches: Map<string, RunBatch>;
  private readonly _batchWrites: Set<Promise<void>>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `RunHost` class.
   *
   * @param init What the host is composed of.
   */
  public constructor(init: IRunHostInit) {
    this._init = init;
    this._active = new Map();
    this._results = new Map();
    this._latest = new Map();
    this._batches = new Map();
    this._batchWrites = new Set();
  }

  // #endregion

  // #region Methods

  /**
   * Starts a command of a project.
   *
   * @param request The command.
   * @param dryRun The value of Dry run.
   * @returns The run.
   */
  public start(request: RunStartRequest, dryRun: boolean): ActiveRun {
    return this.launch(request.command, request.projectId, dryRun, null, false, (hosting) =>
      this._init.commands.run(request, hosting),
    );
  }

  /**
   * Starts a stored run again from its options.
   *
   * @param record The stored run.
   * @param projectId The project.
   * @param dryRun The value of Dry run.
   * @returns The run.
   */
  public repeat(record: RunRecord, projectId: string, dryRun: boolean): ActiveRun {
    return this.launch(
      record.command as ConfiguredCommand,
      projectId,
      dryRun,
      null,
      false,
      (hosting) => this._init.commands.repeat(record, projectId, hosting),
    );
  }

  /**
   * Starts a command on all projects of a workspace, a bounded number at a time, with one run and one result per project. A project
   * that fails ends with its failure and the others go on.
   *
   * @param workspaceId The workspace.
   * @param projectIds The projects.
   * @param command The command.
   * @param dryRun The value of Dry run.
   * @returns The runs. All of them show up at once, and the later ones wait.
   * @throws EngineError while a batch of this workspace goes on.
   */
  public startAll(
    workspaceId: string,
    projectIds: ReadonlyArray<string>,
    command: ConfiguredCommand,
    dryRun: boolean,
  ): Array<ActiveRun> {
    if (
      this._batches
        .get(workspaceId)
        ?.rows.some((row) => row.state === 'waiting' || row.state === 'running')
    ) {
      throw new EngineError('invalid-arguments', 'Run on all projects is still going on.');
    }

    const concurrency = command === 'generate' ? MAX_PARALLEL_TRANSLATIONS : MAX_PARALLEL_RUNS;
    const slots = new Slots(concurrency);
    const batch: RunBatch = {
      id: createSortableId(this.now()),
      workspaceId,
      command,
      dryRun,
      startedAt: this.now().toISOString(),
      concurrency,
      rows: [],
    };
    const changes = new Array<IBatchChange>();
    const runs = projectIds.map((projectId, index) =>
      this.launch(
        command,
        projectId,
        dryRun,
        { id: batch.id, index, total: projectIds.length },
        index >= concurrency,
        async (hosting) => {
          await slots.acquire();

          try {
            if (hosting.signal?.aborted) {
              return {
                runId: hosting.runId as string,
                command,
                projectId,
                state: 'stopped',
                dryRun,
                failure: 'The run was stopped. Nothing was written.',
                outcome: null,
                output: null,
              };
            }

            this.updateRow(batch, hosting.runId as string, { state: 'running' });

            return await this._init.commands.runConfigured(projectId, command, {
              ...hosting,
              collectChanges: (changeSet, writeMode) =>
                changes.push({ runId: hosting.runId as string, projectId, changeSet, writeMode }),
            });
          } finally {
            slots.release();
          }
        },
      ),
    );

    batch.rows = runs.map((run) => ({
      projectId: run.projectId,
      projectName: run.projectName,
      runId: run.id,
      state: 'waiting',
      summary: null,
      failure: null,
    }));
    this._batches.set(workspaceId, batch);
    this._init.publish({ type: 'run.batchUpdated', batchId: batch.id });
    this.writeWhenFinished(batch, runs, changes);

    return runs;
  }

  /**
   * Returns the last batch of a workspace.
   *
   * @param workspaceId The workspace.
   * @returns The batch, or `null` when the app ran none since it started.
   */
  public batchOf(workspaceId: string): RunBatch | null {
    return this._batches.get(workspaceId) ?? null;
  }

  /**
   * Cancels a run. A run of a batch takes the whole batch with it.
   *
   * @param runId The run.
   */
  public cancel(runId: string): void {
    const hosted = this._active.get(runId);

    if (hosted?.run.batch) {
      this.cancelBatch(hosted.run.batch.id);
    } else {
      hosted?.controller.abort();
    }
  }

  /**
   * Stops everything of a batch: what works stops at its next point, and what waits never starts.
   *
   * @param batchId The batch.
   */
  public cancelBatch(batchId: string): void {
    for (const { run, controller } of this._active.values()) {
      if (run.batch?.id === batchId) {
        controller.abort();
      }
    }
  }

  /**
   * Lists what is going on.
   *
   * @returns The runs, oldest first.
   */
  public active(): Array<ActiveRun> {
    return Array.from(this._active.values(), (hosted) => hosted.run);
  }

  /**
   * Returns how a run ended.
   *
   * @param runId The run.
   * @returns The result, or `null` when it is going on or too long ago.
   */
  public result(runId: string): RunResult | null {
    return this._results.get(runId) ?? null;
  }

  /**
   * Returns the last result of a command of a project.
   *
   * @param projectId The project.
   * @param command The command.
   * @returns The result, or `null` when the app has not run it since it started.
   */
  public latest(projectId: string, command: string): RunResult | null {
    const runId = this._latest.get(`${projectId}:${command}`);

    return runId ? this.result(runId) : null;
  }

  /**
   * Stops everything that is going on and waits until it has stopped.
   *
   * @returns When nothing is going on anymore.
   */
  public async shutdown(): Promise<void> {
    const hosted = Array.from(this._active.values());

    for (const { controller } of hosted) {
      controller.abort();
    }

    await Promise.all(hosted.map(({ done }) => done));
    await Promise.all(this._batchWrites);
  }

  /**
   * @private
   */
  private launch(
    command: HostedCommand,
    projectId: string,
    dryRun: boolean,
    batch: ActiveRun['batch'],
    waits: boolean,
    execute: (hosting: IRunHosting) => Promise<RunResult>,
  ): ActiveRun {
    const id = createSortableId(this.now());
    const controller = new AbortController();
    const run: ActiveRun = {
      id,
      command,
      projectId,
      projectName: this._init.projectName(projectId),
      title: command,
      startedAt: this.now().toISOString(),
      dryRun,
      phase: waits ? 'Waiting' : 'Starting',
      completed: 0,
      total: 0,
      detail: null,
      batch,
      log: [],
    };
    const hosted: IHostedRun = { run, controller, done: Promise.resolve(), lastProgress: 0 };

    this._active.set(id, hosted);
    this._init.publish({ type: 'run.started', run });
    hosted.done = this.follow(hosted, execute);

    return run;
  }

  /**
   * @private
   */
  private async follow(
    hosted: IHostedRun,
    execute: (hosting: IRunHosting) => Promise<RunResult>,
  ): Promise<void> {
    const { run, controller } = hosted;
    const result = await execute({
      ...this._init.hosting?.(),
      runId: run.id,
      dryRun: run.dryRun,
      signal: controller.signal,
      listener: {
        progress: (event) => this.onProgress(hosted, event),
        log: (entry) => this.onLog(hosted, entry.message),
      },
    }).catch((error: unknown): RunResult => ({
      runId: run.id,
      command: run.command,
      projectId: run.projectId,
      state: 'failed',
      dryRun: run.dryRun,
      failure: error instanceof Error ? error.message : String(error),
      outcome: null,
      output: null,
    }));

    this.remember({ ...result, runId: run.id });
    this._active.delete(run.id);
    this.finishRow(run, result);
    this._init.publish({
      type: 'run.finished',
      runId: run.id,
      command: run.command,
      projectId: run.projectId,
      state: result.state,
      failure: result.failure,
    });

    if (result.outcome && result.outcome.state !== 'unchanged') {
      this._init.publish({ type: 'changes.updated' });
    }
  }

  /**
   * Writes one change set per repository when every project of a batch has ended. Until then the batch counts as going on.
   *
   * @private
   */
  private writeWhenFinished(
    batch: RunBatch,
    runs: ReadonlyArray<ActiveRun>,
    changes: ReadonlyArray<IBatchChange>,
  ): void {
    const finished = Promise.all(runs.map((run) => (this._active.get(run.id) as IHostedRun).done))
      .then(() => {
        if (changes.length === 0) {
          return;
        }

        const wasStopped = batch.rows.some((row) => row.state === 'stopped');

        for (const { runId, outcome, failure } of this._init.commands.writeBatch(
          changes,
          wasStopped,
        )) {
          this.finishWrite(batch, runId, outcome, failure);
        }

        this._init.publish({ type: 'changes.updated' });
      })
      .catch((error: unknown) => {
        for (const { runId } of changes) {
          this.finishWrite(
            batch,
            runId,
            null,
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        this._batchWrites.delete(finished);
      });

    this._batchWrites.add(finished);
  }

  /**
   * @private
   */
  private finishWrite(
    batch: RunBatch,
    runId: string,
    outcome: RunResult['outcome'],
    failure: string | null,
  ): void {
    const earlier = this._results.get(runId);

    if (earlier) {
      const result: RunResult = {
        ...earlier,
        outcome: outcome ?? earlier.outcome,
        state: failure ? 'failed' : earlier.state,
        failure: failure ?? earlier.failure,
      };

      this._results.set(runId, result);
      this.updateRow(batch, runId, {
        state: rowStateOf(result),
        summary: describeResult(result),
        failure: result.failure,
      });
    }
  }

  /**
   * @private
   */
  private batchOfRun(run: ActiveRun): RunBatch | null {
    return Array.from(this._batches.values()).find((batch) => batch.id === run.batch?.id) ?? null;
  }

  /**
   * @private
   */
  private finishRow(run: ActiveRun, result: RunResult): void {
    const batch = this.batchOfRun(run);

    if (batch) {
      this.updateRow(batch, run.id, {
        state: rowStateOf(result),
        summary: describeResult(result),
        failure: result.state === 'failed' ? result.failure : null,
      });
    }
  }

  /**
   * @private
   */
  private updateRow(batch: RunBatch, runId: string, change: Partial<RunBatchRow>): void {
    batch.rows = batch.rows.map((row) => (row.runId === runId ? { ...row, ...change } : row));
    this._init.publish({ type: 'run.batchUpdated', batchId: batch.id });
  }

  /**
   * @private
   */
  private onProgress(
    hosted: IHostedRun,
    event: { phase: string; completed: number; total: number; detail: string | null },
  ): void {
    const { run } = hosted;
    const now = Date.now();
    const isFirstOfPhase = run.phase !== event.phase;

    run.phase = event.phase;
    run.completed = event.completed;
    run.total = event.total;
    run.detail = event.detail;

    if (isFirstOfPhase || now - hosted.lastProgress >= PROGRESS_INTERVAL_MS) {
      hosted.lastProgress = now;
      this._init.publish({
        type: 'run.progress',
        runId: run.id,
        phase: event.phase,
        completed: event.completed,
        total: event.total,
        detail: event.detail,
      });
    }
  }

  /**
   * @private
   */
  private onLog(hosted: IHostedRun, line: string): void {
    const { run } = hosted;
    const message = this._init.scrub?.(line) ?? line;

    run.log = [...run.log, message].slice(-MAX_LOG_LINES);
    this._init.publish({ type: 'run.log', runId: run.id, lines: [message] });
  }

  /**
   * @private
   */
  private remember(result: RunResult): void {
    this._results.set(result.runId, result);
    this._latest.set(`${result.projectId}:${result.command}`, result.runId);

    for (const oldest of this._results.keys()) {
      if (this._results.size <= MAX_RESULTS) {
        break;
      }

      this._results.delete(oldest);
    }
  }

  /**
   * @private
   */
  private now(): Date {
    return this._init.now?.() ?? new Date();
  }

  // #endregion
}

/**
 * @private
 */
function rowStateOf(result: RunResult): RunBatchRow['state'] {
  return result.state === 'succeeded' || result.state === 'stopped' ? result.state : 'failed';
}

/**
 * Says in one line what a run of a batch found or changed.
 *
 * @private
 */
function describeResult(result: RunResult): string | null {
  if (result.state !== 'succeeded') {
    return null;
  }

  const count = (number: number, word: string): string =>
    `${number.toLocaleString('en')} ${word}${number === 1 ? '' : 's'}`;
  const written = (): string => {
    const files = result.outcome?.files.length ?? 0;

    switch (result.outcome?.state) {
      case 'applied':
        return `${count(files, 'file')} written`;
      case 'pending':
        return `${count(files, 'file')} waiting in Review`;
      default:
        return files > 0 ? `${count(files, 'file')} ready to write` : 'Nothing to change';
    }
  };

  switch (result.output?.command) {
    case 'detect':
      return `${count(result.output.scan.hardCoded, 'hard-coded string')} in ${count(result.output.scan.filesScanned, 'file')}`;
    case 'analyze': {
      const failing = result.output.rules.filter((rule) => !rule.passed).length;

      return failing === 0
        ? `All ${count(result.output.rules.length, 'rule')} passed`
        : `${count(failing, 'rule')} failing`;
    }
    case 'generate':
      return `${count(result.output.translated, 'key')} translated, ${written().toLowerCase()}`;
    default:
      return written();
  }
}
