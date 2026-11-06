// #region Imports

import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import {
  ProgramCommandBase,
  type IFileSystem,
  type ILogger,
  type ProgramCommandResult,
} from '@pixel-brewery/utilities';
import {
  CommandFailureReportSchema,
  type CommandFailureReport,
  type CommandReport,
  type ProjectOptions,
} from '@pixel-brewery/wortlaut-contracts';
import {
  EngineError,
  WortlautEngine,
  type IEngineInit,
  type IEngineOutcome,
  type IResolvedConfiguration,
  type IResultCacheRequest,
} from '@pixel-brewery/wortlaut-engine';
import type { ICliArgsConfig } from '../../arguments/configurations/ICliArgsConfig.js';
import { CommandLine, type ICommandLine } from '../../CommandLine.js';
import { ProgressPresenter } from '../../ProgressPresenter.js';

import { packageVersion } from '../../PackageVersion.js';

// #endregion

/**
 * The logger of a command with JSON output: stdout belongs to the document, so everything else goes to stderr.
 */
const STDERR_LOGGER: ILogger = {
  log: (...args: Array<unknown>) => console.error(...args),
  debug: (...args: Array<unknown>) => console.error(...args),
  info: (...args: Array<unknown>) => console.error(...args),
  warn: (...args: Array<unknown>) => console.error(...args),
  error: (...args: Array<unknown>) => console.error(...args),
};

/**
 * A command as a thin surface over the engine: it turns its arguments into a resolved configuration, calls a use case and
 * presents the outcome as text or as JSON.
 *
 * @internal
 */
export abstract class EngineCommand<
  TConfig extends ICliArgsConfig,
  TResult,
> extends ProgramCommandBase<TConfig> {
  // #region Fields

  private readonly _logger: ILogger;
  private readonly _fileSystem: IFileSystem;
  private _commandLine: ICommandLine;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `EngineCommand` class.
   *
   * @protected
   */
  protected constructor(config: TConfig, logger: ILogger, fileSystem: IFileSystem) {
    super(config);

    this._logger = logger;
    this._fileSystem = fileSystem;
    this._commandLine = { given: new Set(), positionals: [] };
  }

  // #endregion

  // #region Properties

  /**
   * Gets the settings that the arguments of this command set, by the name of the parsed value.
   *
   * @protected
   * @readonly
   */
  protected abstract get settingNames(): Readonly<Record<string, string>>;

  /**
   * Gets the defaults of the parsed values, to tell what was given from what merely holds its default.
   *
   * @protected
   * @readonly
   */
  protected abstract get defaults(): TConfig;

  /**
   * Gets the logger for human output.
   *
   * @protected
   * @readonly
   */
  protected get logger(): ILogger {
    return this.config.json ? STDERR_LOGGER : this._logger;
  }

  /**
   * Gets the absolute working directory of this command.
   *
   * @protected
   * @readonly
   */
  protected get cwd(): string {
    return resolve(this.config.cwd || process.cwd());
  }

  /**
   * Gets the positionals of the command line.
   *
   * @protected
   * @readonly
   */
  protected get positionals(): Array<string> {
    return this._commandLine.positionals;
  }

  // #endregion

  // #region Methods

  /**
   * Reads the command line, which the program parses after this method without handing over what is needed here.
   *
   * @public
   * @override
   */
  public override initialize(): Promise<void> {
    this._commandLine = CommandLine.read(process.argv.slice(3), this.args ?? []);

    return Promise.resolve();
  }

  /**
   * Runs the command and presents its outcome. With JSON output a failure is a document as well.
   *
   * @public
   * @override
   */
  public override async execute(): Promise<ProgramCommandResult<TResult>> {
    const progress = new ProgressPresenter(this.logger);

    try {
      const outcome = await this.run(this.createEngine(progress));

      await this.present(outcome.report);
      this.presentChanges(outcome.report);

      if (this.failsOn(outcome.report)) {
        process.exitCode = 1;
      }

      return { canceled: false, result: outcome.result };
    } catch (error) {
      if (!this.config.json) {
        throw error;
      }

      await this.print(this.describeFailure(error as Error));

      return { canceled: true, error: error as Error };
    } finally {
      progress.dispose();
    }
  }

  /**
   * Calls the use case.
   *
   * @protected
   */
  protected abstract run(
    engine: WortlautEngine,
  ): Promise<IEngineOutcome<TResult> | { result: TResult; report: CommandReport }>;

  /**
   * Presents the report as text. Most commands say all they have to say through their log.
   *
   * @protected
   * @virtual
   */
  protected presentText(_report: CommandReport): void {
    // Nothing beyond the log.
  }

  /**
   * Returns whether a run that finished still ends in a failing exit code. By default it does not, because existing targets
   * depend on that.
   *
   * @protected
   * @virtual
   */
  protected failsOn(_report: CommandReport): boolean {
    return false;
  }

  /**
   * Returns what this command adds to its engine.
   *
   * @protected
   * @virtual
   */
  protected engineInit(): Partial<IEngineInit> {
    return {};
  }

  /**
   * Creates the engine of this run. With JSON output, stdout belongs to the document, so no progress bar shows.
   *
   * @private
   */
  private createEngine(progress: ProgressPresenter): WortlautEngine {
    return new WortlautEngine({
      surface: 'cli',
      logger: this.logger,
      fileSystem: this._fileSystem,
      onProgress: this.config.json ? undefined : (event): void => progress.report(event),
      tool: packageVersion(),
      ...this.engineInit(),
    });
  }

  /**
   * Gets what this run asks of the cache of results, when it asks for one.
   *
   * @protected
   * @readonly
   */
  protected get cacheRequest(): { cache?: IResultCacheRequest } {
    return this.config.cache
      ? { cache: { ...(this.config.cacheDir ? { folder: this.config.cacheDir } : {}) } }
      : {};
  }

  /**
   * Resolves the configuration of this command.
   *
   * @remarks
   * A call that names its own catalogs with `--resource-root` does not read `nx.json` and `project.json`. Such calls
   * existed before any configuration was read, and they keep producing the same files in every Nx repository. Without
   * it, a catalog could never be found before, so there the whole resolution applies.
   *
   * @protected
   */
  protected resolveConfiguration(engine: WortlautEngine): IResolvedConfiguration {
    const configuration = engine.resolveConfiguration({
      cwd: this.cwd,
      arguments: this.collectArguments(),
      readNx: !this.isGiven('resourceRoot'),
      target: this.config.target || undefined,
      configuration: this.config.configuration || undefined,
    });

    for (const warning of configuration.warnings) {
      this.logger.warn(warning);
    }

    return configuration;
  }

  /**
   * Returns whether the command line or the caller sets an option, instead of it holding its default.
   *
   * @protected
   */
  protected isGiven(name: string): boolean {
    const value = (this.config as Record<string, unknown>)[name];

    return (
      this._commandLine.given.has(name) ||
      (value !== undefined &&
        JSON.stringify(value) !== JSON.stringify((this.defaults as Record<string, unknown>)[name]))
    );
  }

  /**
   * Builds the options tree of the given arguments.
   *
   * @private
   */
  private collectArguments(): ProjectOptions {
    const tree: Record<string, unknown> = {};

    for (const [name, setting] of Object.entries(this.settingNames)) {
      if (this.isGiven(name)) {
        const path = setting.split('.');
        let node = tree;

        for (const segment of path.slice(0, -1)) {
          node[segment] ??= {};
          node = node[segment] as Record<string, unknown>;
        }

        node[path[path.length - 1]] = (this.config as Record<string, unknown>)[name];
      }
    }

    return tree as ProjectOptions;
  }

  /**
   * @private
   */
  private async present(report: CommandReport): Promise<void> {
    if (this.config.json) {
      await this.print(report);
    } else {
      this.presentText(report);
    }
  }

  /**
   * Says what happened to the change set, unless the document says so already.
   *
   * @private
   */
  private presentChanges(report: CommandReport): void {
    const changeSet = report.changeSet;

    if (this.config.json || !changeSet || report.command.startsWith('changes.')) {
      return;
    }

    const files = changeSet.files.map((file) => file.displayPath).join(', ');

    switch (changeSet.state) {
      case 'proposed':
        this._logger.log(`Dry run: ${changeSet.files.length} file(s) would be written: ${files}`);
        break;
      case 'pending':
        this._logger.log(
          `Change set ${changeSet.id} waits for review with ${changeSet.files.length} file(s): ${files}`,
        );
        this._logger.log(`Write it with: wortlaut changes apply ${changeSet.id}`);
        break;
      default:
        this._logger.log(`${changeSet.files.length} file(s) written: ${files}`);
    }
  }

  /**
   * @private
   */
  private describeFailure(error: Error): CommandFailureReport {
    const engineError = error instanceof EngineError ? error : null;

    return CommandFailureReportSchema.parse({
      ok: false,
      command: this.name,
      error: {
        code: engineError?.code ?? 'failed',
        message: stripVTControlCharacters(error.message),
        files: engineError ? [...engineError.files] : [],
        changeSetId: engineError?.changeSetId ?? null,
        runId: engineError?.runId ?? null,
      },
    });
  }

  /**
   * Prints the document and waits until a pipe took all of it: the program exits right after a command, and that would cut off
   * a document larger than the pipe.
   *
   * @private
   */
  private print(document: unknown): Promise<void> {
    return new Promise((done) => {
      if (process.stdout.write(`${JSON.stringify(document)}\n`, () => done())) {
        done();
      }
    });
  }

  // #endregion
}
