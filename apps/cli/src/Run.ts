// #region Imports

import { Path, type ILogger } from '@pixel-brewery/utilities';
import type {
  IResourceGeneratorResult,
  LocalAssistants,
  ResourceGeneratorKeyScope,
} from '@pixel-brewery/wortlaut-ai';
import {
  DEFAULT_PROJECT_OPTIONS,
  type RuleSeverity,
  type Surface,
  type WriteMode,
} from '@pixel-brewery/wortlaut-contracts';
import {
  Presets,
  ResourceMode,
  type IAnalyzerRuleResult,
  type ILocalizationProcessorEventMap,
  type ILocalizationProcessorResult,
  type IProcessOptions,
  type IResourceInfo,
  type IResourceTransformerResult,
  type ResourceType,
} from '@pixel-brewery/wortlaut-core';
import {
  CommandOptions,
  LiteralFileSystem,
  PathResolver,
  WortlautEngine,
  type IAnalysisGate,
  type IEngineOutcome,
} from '@pixel-brewery/wortlaut-engine';
import { createCliAssistants, createLocalStrategies } from './cli/ai/CliProviders.js';
import { packageVersion } from './cli/PackageVersion.js';
import { ProgressPresenter } from './cli/ProgressPresenter.js';

// #endregion

/**
 * Configuration interface for the run function.
 *
 * @public
 */
export interface IRunConfig {
  cwd: string;
  dryRun?: boolean;

  /**
   * Leaves the change set in the review list instead of applying it, for `wortlaut changes apply`.
   */
  review?: boolean;

  /**
   * The surface recorded on the run. By default `nx` inside an Nx task and `api` otherwise.
   */
  surface?: Surface;

  verbose?: boolean;

  /**
   * Reuses the results of files that did not change, for Analyze and Detect. It changes no result, and a dry run only reads it. Off
   * unless `enabled` says otherwise.
   */
  cache?: {
    enabled?: boolean;

    /**
     * The folder, relative to `cwd`. By default `.wortlaut/cache`.
     */
    dirPath?: string;
  };
  callback?: {
    onDetected?: (...args: ILocalizationProcessorEventMap['detected']) => void;
    onFailed?: (...args: ILocalizationProcessorEventMap['failed']) => void;
  };
  actions: {
    detect?: IProcessOptions & {
      languages?: Array<string>;
      root?: string;
      resourceRoot?: string | Array<string>;
      preset?: Presets;
      type?: ResourceMode;
    };
    sort?: {
      order?: 'asc' | 'desc';
    };
    analyze?: {
      rules?: Array<string>;

      /**
       * Keys that count as used although no source mentions them, for example keys that another library composes
       * at runtime: exact keys, globs such as `loc.api.error.*` or `loc.orders.{open,closed}.label`, or regular
       * expressions written as `/expression/flags`. See the `analyze` documentation for the syntax.
       */
      usedKeys?: Array<string>;

      /**
       * The locale that the `missing-translations` rule compares the values of the other locales with.
       * Defaults to `generate.baseLocale`, then to `en`.
       */
      baseLocale?: string;

      /**
       * Each of these locales must have at least one translation key in the catalog roots.
       */
      expectedLocales?: Array<string>;

      /**
       * Patterns of keys whose value may be identical to the base locale's value, for `missing-translations`.
       * `*` matches any sequence of characters, e.g. `loc.integrations.*.name`.
       */
      identicalKeys?: Array<string>;

      /**
       * Values that need no translation and may be identical to the base locale's value, for
       * `missing-translations`, such as brand names, units or abbreviations, e.g. `PDF`.
       */
      identicalValues?: Array<string>;

      /**
       * What each rule is worth. A rule that is `off` does not run.
       */
      severities?: Record<string, RuleSeverity>;

      /**
       * Keys one rule leaves alone, by the id of the rule.
       */
      ruleExceptions?: Record<string, Array<string>>;

      /**
       * The packs of the lock file that do not run.
       */
      disabledPacks?: Array<string>;
    };
    transform?: {
      types?: Array<ResourceType>;
    };
    generate?: {
      apiKey?: string;
      model?: string;
      temperature?: number;
      locales?: Array<string>;
      baseLocale?: string;
      chunkSize?: number;
      limit?: number | null;
      instructions?: string | Array<string>;
      onlyNew?: boolean;

      /**
       * Which keys to translate. `onlyNew` selects `new` as well.
       */
      scope?: ResourceGeneratorKeyScope;

      /**
       * Translates only the keys below this namespace.
       */
      namespace?: string;

      strategy?: string;
    };
  };
}

/**
 * Result interface for the run function.
 *
 * @public
 */
export interface IRunResult {
  localizations?: Array<ILocalizationProcessorResult>;
  analyze?: Array<IAnalyzerRuleResult>;
  generate?: Array<IResourceGeneratorResult>;
  transform?: Array<IResourceTransformerResult>;
  sort?: Array<IResourceInfo>;

  /**
   * The id of the recorded run, or `null` where no profile can be written.
   */
  runId?: string | null;

  /**
   * The id of the change set, which waits in the review list with `review`.
   */
  changeSetId?: string | null;

  /**
   * What an analysis says about severities and packs, for a repository that uses them. An executor fails on its errors and on
   * a refused pack; without severities and a lock file this stays out, and so does any new reason to fail.
   */
  gate?: IAnalysisGate;
}

type CommandType = 'analyze' | 'generate' | 'transform' | 'sort' | 'detect';

/**
 * Returns the command that a configuration asks for.
 */
function determineCommandType(config: IRunConfig): CommandType {
  if (config.actions.analyze) {
    return 'analyze';
  }

  if (config.actions.generate) {
    return 'generate';
  }

  if (config.actions.transform) {
    return 'transform';
  }

  if (config.actions.sort) {
    return 'sort';
  }

  return 'detect';
}

/**
 * Coordinates execution of Wortlaut commands based on the provided configuration. The configuration is complete: Nx has
 * merged the executor's options before it calls `run()`, so no configuration file is read here.
 */
class RunExecutor {
  // #region Fields

  private readonly _config: IRunConfig;
  private readonly _engine: WortlautEngine;
  private readonly _writeMode: WriteMode;
  private readonly _sourceRoot: string;
  private readonly _resourceRoots: Array<string>;
  private readonly _progress: ProgressPresenter;
  private readonly _assistants: LocalAssistants;

  // #endregion

  // #region Ctor

  /**
   * Initializes a new instance of the run executor.
   *
   * @param config The configuration used to orchestrate the run.
   */
  public constructor(config: IRunConfig) {
    const detect = config.actions.detect;

    this._config = config;
    this._writeMode = CommandOptions.resolveWriteMode(config.dryRun, config.review);
    this._sourceRoot = Path.combine(config.cwd, detect?.root ?? '');
    this._resourceRoots = PathResolver.resourceRootsFromOptions(
      this._sourceRoot,
      detect?.resourceRoot ?? '',
    );
    this._progress = new ProgressPresenter(console as ILogger);
    this._assistants = createCliAssistants();
    this._engine = new WortlautEngine({
      strategies: createLocalStrategies(this._assistants),
      surface: config.surface ?? (process.env.NX_TASK_TARGET_PROJECT ? 'nx' : 'api'),
      logger: console as ILogger,
      fileSystem: new LiteralFileSystem(),
      onProgress: (event): void => this._progress.report(event),
      tool: packageVersion(),
    });
  }

  // #endregion

  // #region Methods

  /**
   * Executes the configured Wortlaut command.
   */
  public async execute(): Promise<IRunResult> {
    try {
      switch (determineCommandType(this._config)) {
        case 'analyze':
          return this.toResult('analyze', await this.analyze());
        case 'generate':
          return this.toResult('generate', await this.generate());
        case 'transform':
          return this.toResult('transform', await this.transform());
        case 'sort':
          return this.toResult('sort', await this.sort());
        default:
          return this.toResult('localizations', await this.detect());
      }
    } finally {
      this._progress.dispose();
      await this._assistants.dispose();
    }
  }

  private toResult<TKey extends keyof IRunResult, TResult>(
    key: TKey,
    outcome: IEngineOutcome<TResult>,
  ): IRunResult {
    const gate = (outcome.report.data as { gate?: IAnalysisGate } | null | undefined)?.gate;

    return {
      [key]: outcome.result,
      runId: outcome.report.runId,
      changeSetId: outcome.changeSet?.id ?? null,
      ...(gate ? { gate } : {}),
    };
  }

  private get cacheRequest(): { cache?: { folder?: string } } {
    const { cache } = this._config;

    return cache?.enabled ? { cache: { ...(cache.dirPath ? { folder: cache.dirPath } : {}) } } : {};
  }

  private get type(): ResourceMode {
    return this._config.actions.detect?.type ?? ResourceMode.Json;
  }

  private get resourceKey(): { prefix: string; suffix: string } {
    return {
      prefix: this._config.actions.detect?.resourceKey?.prefix ?? '',
      suffix: this._config.actions.detect?.resourceKey?.suffix ?? '',
    };
  }

  private analyze(): Promise<IEngineOutcome<Array<IAnalyzerRuleResult>>> {
    const { analyze, generate, detect } = this._config.actions;

    return this._engine.analyze({
      cwd: this._config.cwd,
      writeMode: this._writeMode,
      ...this.cacheRequest,
      options: {
        baseLocale:
          analyze?.baseLocale ??
          generate?.baseLocale ??
          DEFAULT_PROJECT_OPTIONS.actions.generate.baseLocale,
        identicalKeys: analyze?.identicalKeys ?? [],
        identicalValues: analyze?.identicalValues ?? [],
        preset: detect?.preset ?? Presets.Lit,
        root: this._sourceRoot,
        type: this.type,
        resourceRoot: this._resourceRoots,
        resourceKeyPrefix: this.resourceKey.prefix,
        resourceKeySuffix: this.resourceKey.suffix,
        rules: analyze?.rules ?? [],
        usedKeys: analyze?.usedKeys ?? [],
        ...(analyze?.expectedLocales?.length ? { expectedLocales: analyze.expectedLocales } : {}),
        ...(analyze?.severities ? { severities: analyze.severities } : {}),
        ...(analyze?.ruleExceptions ? { ruleExceptions: analyze.ruleExceptions } : {}),
        ...(analyze?.disabledPacks ? { disabledPacks: analyze.disabledPacks } : {}),
      },
    });
  }

  private generate(): Promise<IEngineOutcome<Array<IResourceGeneratorResult>>> {
    const generate = this._config.actions.generate;
    const defaults = DEFAULT_PROJECT_OPTIONS.actions.generate;

    return this._engine.generate({
      cwd: this._config.cwd,
      writeMode: this._writeMode,
      options: {
        apiKey: generate?.apiKey ?? defaults.apiKey,
        baseLocale: generate?.baseLocale ?? defaults.baseLocale,
        chunkSize: generate?.chunkSize ?? defaults.chunkSize,
        limit: generate?.limit ?? defaults.limit,
        instructions: generate?.instructions ?? defaults.instructions,
        locales: generate?.locales ?? [],
        model: generate?.model ?? defaults.model,
        onlyNew: generate?.onlyNew ?? defaults.onlyNew,
        scope: generate?.scope ?? defaults.scope,
        namespace: generate?.namespace ?? defaults.namespace,
        identicalKeys: this._config.actions.analyze?.identicalKeys ?? [],
        identicalValues: this._config.actions.analyze?.identicalValues ?? [],
        resourceRoot: this._resourceRoots,
        strategy: generate?.strategy ?? defaults.strategy,
        temperature: generate?.temperature ?? defaults.temperature,
        type: this.type,
        dumpModels: this._config.verbose ?? false,
      },
    });
  }

  private transform(): Promise<IEngineOutcome<Array<IResourceTransformerResult>>> {
    return this._engine.transform({
      cwd: this._config.cwd,
      writeMode: this._writeMode,
      options: {
        resourceRoot: this._resourceRoots,
        types: this._config.actions.transform?.types ?? [],
        type: this.type,
      },
    });
  }

  private sort(): Promise<IEngineOutcome<Array<IResourceInfo>>> {
    return this._engine.sort({
      cwd: this._config.cwd,
      writeMode: this._writeMode,
      options: {
        order: this._config.actions.sort?.order ?? DEFAULT_PROJECT_OPTIONS.actions.sort.order,
        resourceRoot: this._resourceRoots,
        type: this.type,
      },
    });
  }

  private detect(): Promise<IEngineOutcome<Array<ILocalizationProcessorResult>>> {
    return this._engine.detect({
      cwd: this._config.cwd,
      writeMode: this._writeMode,
      ...this.cacheRequest,
      options: {
        preset: this._config.actions.detect?.preset ?? Presets.Lit,
        resourceKeyPrefix: this.resourceKey.prefix,
        resourceKeySuffix: this.resourceKey.suffix,
        root: this._sourceRoot,
        type: this.type,
      },
    });
  }

  // #endregion
}

/**
 * Runs the Wortlaut tool with the provided configuration.
 */
export async function run(config: IRunConfig): Promise<IRunResult> {
  const executor = new RunExecutor(config);

  return executor.execute();
}
