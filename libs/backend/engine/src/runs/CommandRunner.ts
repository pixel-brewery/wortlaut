// #region Imports

import type { IFileSystem, ILogger } from '@pixel-brewery/utilities';
import type {
  ChangeSet,
  ChangeSetSummary,
  CommandReport,
  Finding,
  RunCommandName,
  RunFailure,
  RunLogEntry,
  RunProgressEvent,
  RunRecord,
  RunState,
  Surface,
  WriteMode,
} from '@pixel-brewery/wortlaut-contracts';
import { ResultCache, type IResultCacheRequest } from '../cache/ResultCache.js';
import type { ChangeSetApplier } from '../changes/ChangeSetApplier.js';
import { ChangeSetBuilder } from '../changes/ChangeSetBuilder.js';
import type { IRecoveredChangeSet } from '../changes/ChangeSetRecovery.js';
import type { ReviewList } from '../changes/ReviewList.js';
import { EngineError } from '../errors/EngineError.js';
import { createSortableId } from '../io/AtomicFile.js';
import { SecretScrubber } from '../security/SecretScrubber.js';
import { MAX_LOG_ENTRIES, RunLogger } from './RunLogger.js';
import type { RunStore } from './RunStore.js';

// #endregion

/**
 * The most findings a run keeps.
 */
const MAX_FINDINGS = 1000;

/**
 * How long a long run keeps the event loop before it lets others in, so a cancellation and a progress event get through.
 */
const MAX_BLOCKED_MS = 16;

/**
 * Receives what a run does while it goes on. A surface that shows live runs passes one with its call.
 *
 * @public
 */
export interface IRunListener {
  progress?(event: RunProgressEvent): void;
  log?(entry: RunLogEntry): void;
}

/**
 * What a use case needs for one run.
 *
 * @internal
 */
export interface IUseCaseContext {
  runId: string;
  cwd: string;
  logger: ILogger;
  fileSystem: IFileSystem;
  scrubber: SecretScrubber;
  changes: ChangeSetBuilder;
  signal: AbortSignal | undefined;

  /**
   * Results of work whose inputs did not change, when the run asked for them.
   */
  cache: ResultCache | null;
  progress(phase: string, completed: number, total: number, detail: string | null): void;

  /**
   * Marks a point where a long run may stop: it stops here when it was cancelled, tells the listener of this call how
   * far it is and lets others in now and then. Without a listener and a signal it does nothing.
   *
   * @throws EngineError `run-stopped` when the run was cancelled.
   */
  checkpoint(phase: string, completed: number, total: number, detail: string | null): Promise<void>;
}

/**
 * What a use case produced.
 *
 * @internal
 */
export interface IUseCaseOutput<TResult> {
  /**
   * The engine objects for callers in the same process.
   */
  result: TResult;

  /**
   * The JSON-safe result for reports.
   */
  data: unknown;

  findings?: Array<Finding>;

  /**
   * A failure or a stop that leaves finished work: the proposals go to the review list instead of the files.
   */
  failure?: EngineError | null;

  /**
   * The change set holds only part of what the run set out to do, although the run did not fail.
   */
  partial?: boolean;

  /**
   * A change set the use case handled itself, for commands that work on the review list.
   */
  handledChangeSet?: ChangeSet | null;

  /**
   * The rules an analysis really ran, for its record.
   */
  executedRules?: Array<string>;
}

/**
 * A use case of the engine.
 *
 * @internal
 */
export interface IUseCase<TOptions, TResult> {
  readonly command: RunCommandName;

  /**
   * What the change set should say about where it comes from.
   */
  detail?(options: TOptions): string | null;

  execute(options: TOptions, context: IUseCaseContext): Promise<IUseCaseOutput<TResult>>;
}

/**
 * One call of a use case.
 *
 * @public
 */
export interface IEngineRequest<TOptions> {
  /**
   * The working directory of the command.
   */
  cwd: string;

  options: TOptions;

  /**
   * What to do with the change set.
   *
   * @default 'apply'
   */
  writeMode?: WriteMode;

  /**
   * Stops the run. A stopped run writes nothing.
   */
  signal?: AbortSignal;

  /**
   * The id of the run, for a surface that names it before the run starts.
   */
  runId?: string;

  /**
   * Receives what this run does while it goes on.
   */
  listener?: IRunListener;

  /**
   * The recorded run this call belongs to, such as a translation whose accepted rows are written later. The call makes no
   * record of its own: the run keeps its options and its duration, and takes over the log and the change set of this call.
   */
  continuesRun?: string;

  /**
   * Reuses results of files that did not change. Without it the run reads and writes no cache.
   */
  cache?: IResultCacheRequest;

  /**
   * `true` adds what a run does in detail to its log, and `false` keeps debug output out of it. Without it a run logs as it
   * always did.
   */
  verbose?: boolean;

  /**
   * Takes what this run wants to write instead of writing it, for a batch that writes one change set per repository in the end. The
   * write mode says what should become of it.
   */
  collectChanges?: (changeSet: ChangeSet, writeMode: WriteMode) => void;
}

/**
 * The outcome of a use case.
 *
 * @public
 */
export interface IEngineOutcome<TResult> {
  /**
   * The engine objects, for callers in the same process.
   */
  result: TResult;

  /**
   * The JSON-safe report.
   */
  report: CommandReport;

  /**
   * The change set with its contents, or `null` when the command changes no file.
   */
  changeSet: ChangeSet | null;
}

/**
 * What the runner is composed of.
 *
 * @internal
 */
export interface ICommandRunnerInit {
  surface: Surface;
  logger: ILogger;
  fileSystem: IFileSystem;
  runs: RunStore;
  reviewList: ReviewList;
  applier: ChangeSetApplier;

  /**
   * What identifies the tool in the key of a cached result.
   */
  tool?: string;

  now: () => Date;
  onProgress?: (event: RunProgressEvent) => void;
}

/**
 * Runs every use case the same way: it collects the proposals into a change set, applies it, stores it for review or
 * only reports it, and records the run however it ended.
 *
 * @internal
 */
export class CommandRunner {
  // #region Fields

  private readonly _init: ICommandRunnerInit;
  private _guardPath: ((path: string) => void) | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `CommandRunner` class.
   *
   * @param init What the runner is composed of.
   */
  public constructor(init: ICommandRunnerInit) {
    this._init = init;
    this._guardPath = null;
  }

  // #endregion

  // #region Properties

  /**
   * Gets what writes the change sets.
   *
   * @readonly
   */
  public get applier(): ChangeSetApplier {
    return this._init.applier;
  }

  // #endregion

  // #region Methods

  /**
   * Sets what refuses a file a change set wants to write, before it is written or stored.
   *
   * @param guard Throws for a file that may not be written.
   */
  public guardPaths(guard: (path: string) => void): void {
    this._guardPath = guard;
  }

  /**
   * Runs a use case.
   *
   * @param useCase The use case.
   * @param request The call.
   * @returns The outcome.
   * @throws The failure of the run, after the run was recorded and with secrets removed from its message.
   */
  public async run<TOptions, TResult>(
    useCase: IUseCase<TOptions, TResult>,
    request: IEngineRequest<TOptions>,
  ): Promise<IEngineOutcome<TResult>> {
    const startedAt = this._init.now();
    const runId = request.runId ?? createSortableId(startedAt);
    const writeMode = request.writeMode ?? 'apply';
    const scrubber = new SecretScrubber();
    const logger = new RunLogger(
      this._init.logger,
      scrubber,
      request.listener?.log ? (entry): void => request.listener?.log?.(entry) : undefined,
      request.verbose !== false,
    );
    const cache = ResultCache.open(
      request.cwd,
      request.cache,
      this._init.tool,
      writeMode === 'apply',
    );
    const changes = new ChangeSetBuilder(createSortableId(startedAt), request.cwd, startedAt, {
      command: useCase.command,
      surface: this._init.surface,
      runId: request.continuesRun ?? runId,
      detail: useCase.detail?.(request.options) ?? null,
    });
    const context: IUseCaseContext = {
      runId,
      cwd: request.cwd,
      logger,
      fileSystem: this._init.fileSystem,
      scrubber,
      changes,
      signal: request.signal,
      cache,
      progress: (phase, completed, total, detail) =>
        this._init.onProgress?.({ runId, phase, completed, total, detail }),
      checkpoint: this.createCheckpoint(runId, request),
    };
    let changeSet: ChangeSet | null = null;
    let findings = new Array<Finding>();
    let failure: EngineError | Error | null = null;
    let output: IUseCaseOutput<TResult> | null = null;

    if (request.verbose) {
      logger.debug(`Working directory: ${request.cwd}`);
      logger.debug(`Write mode: ${writeMode}`);
      logger.debug(`Options: ${JSON.stringify(scrubber.sanitize(request.options))}`);
    }

    try {
      output = await useCase.execute(request.options, context);
      findings = output.findings ?? [];
      changeSet =
        output.handledChangeSet ??
        this.finishChanges(changes, output, writeMode, logger, request.collectChanges);
      failure = output.failure ?? null;
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    cache?.finish();

    if (cache && cache.hits + cache.misses > 0) {
      logger.log(`Reused ${cache.hits} of ${cache.hits + cache.misses} results from the cache.`);
    }

    if (request.verbose) {
      logger.debug(
        `Finished after ${this._init.now().getTime() - startedAt.getTime()} ms: ${failure ? failure.message : 'succeeded'}`,
      );
    }

    if (failure) {
      failure.message = scrubber.scrub(failure.message);
      failure.stack = failure.stack ? scrubber.scrub(failure.stack) : failure.stack;
    }

    const state = this.stateOf(failure);
    const recorded = this.record({
      runId,
      command: useCase.command,
      writeMode,
      cwd: request.cwd,
      startedAt,
      state,
      options: scrubber.sanitize(request.options) as Record<string, unknown>,
      logger,
      findings,
      executedRules: output?.executedRules,
      changeSet,
      failure,
      continuesRun: request.continuesRun ?? null,
    });

    if (failure) {
      if (failure instanceof EngineError && recorded) {
        failure.runId = runId;
      }

      throw failure;
    }

    return {
      result: (output as IUseCaseOutput<TResult>).result,
      report: {
        ok: true,
        command: useCase.command,
        runId: recorded ? (request.continuesRun ?? runId) : null,
        state,
        writeMode,
        changeSet: changeSet ? CommandRunner.summarize(changeSet) : null,
        findings,
        data: scrubber.sanitize((output as IUseCaseOutput<TResult>).data),
      },
      changeSet,
    };
  }

  /**
   * Writes change sets that a batch collected: one per repository, each all or nothing. A set that holds only part of what a run set
   * out to do never writes, it waits in the review list.
   *
   * @param changeSet The change set.
   * @param writeMode What should become of it.
   * @returns The change set as it ended up.
   * @throws EngineError naming the files that changed in the meantime, or a full review list.
   */
  public writeCollected(changeSet: ChangeSet, writeMode: WriteMode): ChangeSet {
    for (const file of changeSet.files) {
      this._guardPath?.(file.path);
    }

    if (writeMode === 'review' || changeSet.partial) {
      return this._init.reviewList.add(changeSet);
    }

    this._init.applier.apply(changeSet);

    return { ...changeSet, state: 'applied' };
  }

  /**
   * Records what became of a write that a dead process left behind, so Runs says what happened to the files.
   *
   * @param recovered What became of it.
   */
  public recordRecovery(recovered: IRecoveredChangeSet): void {
    const { entry } = recovered;

    if (!entry) {
      return;
    }

    const now = this._init.now();
    const finished = recovered.outcome === 'finished';
    const record: RunRecord = {
      schemaVersion: 1,
      id: createSortableId(now),
      command: 'changes.recover',
      surface: this._init.surface,
      state: recovered.outcome === 'failed' ? 'failed' : 'succeeded',
      writeMode: 'apply',
      dryRun: false,
      cwd: entry.cwd,
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationMs: 0,
      options: { id: entry.changeSetId, outcome: recovered.outcome },
      log: [{ level: 'warn', message: recovered.message }],
      droppedLogEntries: 0,
      findings: [],
      changeSet: {
        id: entry.changeSetId,
        state: finished ? 'applied' : 'discarded',
        createdAt: entry.startedAt,
        cwd: entry.cwd,
        source: entry.source,
        partial: entry.partial,
        files: entry.files.map((file) => ({
          path: file.target,
          displayPath: file.displayPath,
          action: file.action,
        })),
        findingCount: 0,
      },
      failure:
        recovered.outcome === 'failed'
          ? {
              code: 'failed',
              message: recovered.message,
              files: entry.files.map((file) => file.displayPath),
            }
          : null,
    };

    try {
      this._init.runs.write(record);
    } catch (error) {
      this._init.logger.debug(
        `The recovery was not recorded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Creates the summary of a change set.
   *
   * @param changeSet The change set.
   * @returns The summary without file contents.
   */
  public static summarize(changeSet: ChangeSet): ChangeSetSummary {
    return {
      id: changeSet.id,
      state: changeSet.state,
      createdAt: changeSet.createdAt,
      cwd: changeSet.cwd,
      source: changeSet.source,
      partial: changeSet.partial,
      files: changeSet.files.map(({ path, displayPath, action }) => ({
        path,
        displayPath,
        action,
      })),
      findingCount: changeSet.findings.length,
    };
  }

  /**
   * @private
   */
  private createCheckpoint<TOptions>(
    runId: string,
    request: IEngineRequest<TOptions>,
  ): IUseCaseContext['checkpoint'] {
    const { listener, signal } = request;
    let lastYield = Date.now();

    return async (phase, completed, total, detail) => {
      if (!listener && !signal) {
        return;
      }

      if (signal?.aborted) {
        throw new EngineError('run-stopped', 'The run was stopped. Nothing was written.');
      }

      listener?.progress?.({ runId, phase, completed, total, detail });

      if (Date.now() - lastYield >= MAX_BLOCKED_MS) {
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
        lastYield = Date.now();

        if (signal?.aborted) {
          throw new EngineError('run-stopped', 'The run was stopped. Nothing was written.');
        }
      }
    };
  }

  /**
   * Applies, stores or only reports what the use case proposed. A failed or stopped run never writes: what it finished
   * waits in the review list.
   *
   * @private
   */
  private finishChanges<TResult>(
    changes: ChangeSetBuilder,
    output: IUseCaseOutput<TResult>,
    writeMode: WriteMode,
    logger: ILogger,
    collect?: (changeSet: ChangeSet, writeMode: WriteMode) => void,
  ): ChangeSet | null {
    const failure = output.failure ?? null;
    const built = changes.build(failure !== null || output.partial === true);

    if (built.files.length === 0) {
      return null;
    }

    for (const file of built.files) {
      this._guardPath?.(file.path);
    }

    if (writeMode === 'dry-run') {
      return built;
    }

    if (collect) {
      collect(built, writeMode);

      return built;
    }

    if (failure) {
      return this.keepFinishedWork(built, failure, logger);
    }

    if (writeMode === 'review') {
      return this._init.reviewList.add(built);
    }

    this._init.applier.apply(built);

    return { ...built, state: 'applied' };
  }

  /**
   * @private
   */
  private keepFinishedWork(changeSet: ChangeSet, failure: EngineError, logger: ILogger): ChangeSet {
    try {
      const pending = this._init.reviewList.add(changeSet);

      failure.changeSetId = pending.id;
      logger.warn(
        `The finished work is safe in the review list. Nothing was written. Apply it with: wortlaut changes apply ${pending.id}`,
      );

      return pending;
    } catch (error) {
      logger.warn(
        `The finished work could not be kept: ${error instanceof Error ? error.message : String(error)}`,
      );

      return changeSet;
    }
  }

  /**
   * @private
   */
  private stateOf(failure: Error | null): RunState {
    if (!failure) {
      return 'succeeded';
    }

    return failure instanceof EngineError && failure.code === 'run-stopped' ? 'stopped' : 'failed';
  }

  /**
   * Records a run. A machine without a writable profile, such as a CI runner, simply has no history, which must never
   * fail a command.
   *
   * @private
   */
  private record(run: {
    runId: string;
    command: RunCommandName;
    writeMode: WriteMode;
    cwd: string;
    startedAt: Date;
    state: RunState;
    options: Record<string, unknown>;
    logger: RunLogger;
    findings: Array<Finding>;
    executedRules: Array<string> | undefined;
    changeSet: ChangeSet | null;
    failure: Error | null;
    continuesRun: string | null;
  }): boolean {
    const finishedAt = this._init.now();
    const record: RunRecord = {
      schemaVersion: 1,
      id: run.runId,
      command: run.command,
      surface: this._init.surface,
      state: run.state,
      writeMode: run.writeMode,
      dryRun: run.writeMode === 'dry-run',
      cwd: run.cwd,
      startedAt: run.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - run.startedAt.getTime()),
      options: run.options,
      log: run.logger.entries,
      droppedLogEntries: run.logger.dropped,
      findings: run.findings.slice(0, MAX_FINDINGS),
      ...(run.executedRules ? { executedRules: run.executedRules } : {}),
      changeSet: run.changeSet ? CommandRunner.summarize(run.changeSet) : null,
      failure: run.failure ? CommandRunner.describeFailure(run.failure) : null,
    };

    try {
      const earlier = run.continuesRun ? this._init.runs.get(run.continuesRun) : null;

      this._init.runs.write(earlier ? CommandRunner.continueRun(earlier, record) : record);

      return true;
    } catch (error) {
      this._init.logger.debug(
        `The run was not recorded: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }

  /**
   * Adds what a later call did to a recorded run. The run keeps its options and its duration. A failure of the later call
   * goes into the log, because the run itself ended as it ended.
   *
   * @private
   */
  private static continueRun(earlier: RunRecord, later: RunRecord): RunRecord {
    const applied = later.changeSet?.state === 'applied';
    const failure: Array<RunLogEntry> = later.failure
      ? [{ level: 'error', message: later.failure.message }]
      : [];
    const earlierFiles =
      earlier.changeSet?.state === 'applied'
        ? earlier.changeSet.files.filter(
            (file) => !later.changeSet?.files.some((other) => other.path === file.path),
          )
        : [];

    return {
      ...earlier,
      writeMode: applied ? 'apply' : earlier.writeMode,
      log: [...earlier.log, ...later.log, ...failure].slice(-MAX_LOG_ENTRIES),
      droppedLogEntries: earlier.droppedLogEntries + later.droppedLogEntries,
      changeSet: later.changeSet
        ? { ...later.changeSet, files: [...earlierFiles, ...later.changeSet.files] }
        : earlier.changeSet,
    };
  }

  /**
   * @private
   */
  private static describeFailure(failure: Error): RunFailure {
    return failure instanceof EngineError
      ? { code: failure.code, message: failure.message, files: [...failure.files] }
      : { code: 'failed', message: failure.message, files: [] };
  }

  // #endregion
}
