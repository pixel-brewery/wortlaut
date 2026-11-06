// #region Imports

import type { ProjectOptions, WriteMode } from '@pixel-brewery/wortlaut-contracts';
import type { Presets, ResourceMode, ResourceType } from '@pixel-brewery/wortlaut-core';
import { EngineError } from '../errors/EngineError.js';
import type {
  IAnalyzeOptions,
  IDetectOptions,
  IDetectScanOptions,
  IGenerateOptions,
  ISortOptions,
  ITransformOptions,
} from '../interfaces/ICommandOptions.js';
import type { IResolvedConfiguration } from './ConfigurationResolver.js';

// #endregion

/**
 * Turns a resolved configuration into the options of a command. Only the options a command uses are filled from the
 * environment, so a missing key does not stop `sort`.
 *
 * @public
 */
export namespace CommandOptions {
  /**
   * @public
   */
  export function forSort(configuration: IResolvedConfiguration): ISortOptions {
    const actions = configuration.fill(actionsOf(configuration, 'detect', 'sort'));

    return {
      resourceRoot: requireResourceRoots(configuration),
      type: actions.detect?.type as ResourceMode,
      order: actions.sort?.order as 'asc' | 'desc',
    };
  }

  /**
   * @public
   */
  export function forTransform(configuration: IResolvedConfiguration): ITransformOptions {
    const actions = configuration.fill(actionsOf(configuration, 'detect', 'transform'));

    return {
      resourceRoot: requireResourceRoots(configuration),
      type: actions.detect?.type as ResourceMode,
      types: actions.transform?.types as Array<ResourceType>,
    };
  }

  /**
   * @public
   */
  export function forDetect(configuration: IResolvedConfiguration): IDetectOptions {
    const actions = configuration.fill(actionsOf(configuration, 'detect'));

    return {
      root: configuration.root,
      preset: actions.detect?.preset as Presets | '',
      type: actions.detect?.type as ResourceMode,
      resourceKeyPrefix: actions.detect?.resourceKey?.prefix ?? '',
      resourceKeySuffix: actions.detect?.resourceKey?.suffix ?? '',
    };
  }

  /**
   * Returns the options of a scan that goes on to change sources. A project without catalogs can still be scanned.
   *
   * @public
   */
  export function forDetectScan(
    configuration: IResolvedConfiguration,
    skipTests: boolean,
  ): IDetectScanOptions {
    const actions = configuration.fill(actionsOf(configuration, 'analyze'));

    return {
      ...forDetect(configuration),
      resourceRoot: configuration.resourceRoots.filter((root) => root !== ''),
      baseLocale: actions.analyze?.baseLocale ?? '',
      skipTests,
    };
  }

  /**
   * @public
   */
  export function forAnalyze(configuration: IResolvedConfiguration): IAnalyzeOptions {
    const actions = configuration.fill(actionsOf(configuration, 'analyze'));

    return {
      ...forDetect(configuration),
      resourceRoot: requireResourceRoots(configuration),
      rules: actions.analyze?.rules ?? [],
      usedKeys: actions.analyze?.usedKeys ?? [],
      baseLocale: actions.analyze?.baseLocale ?? '',
      identicalKeys: actions.analyze?.identicalKeys ?? [],
      identicalValues: actions.analyze?.identicalValues ?? [],
      ...(actions.analyze?.severities ? { severities: actions.analyze.severities } : {}),
      ...(actions.analyze?.ruleExceptions
        ? { ruleExceptions: actions.analyze.ruleExceptions }
        : {}),
      ...(actions.analyze?.disabledPacks ? { disabledPacks: actions.analyze.disabledPacks } : {}),
      ...(configuration.settings.find((setting) => setting.key === 'actions.analyze.rules')?.source
        .kind === 'arguments'
        ? { explicitRules: true }
        : {}),
    };
  }

  /**
   * @public
   */
  export function forGenerate(configuration: IResolvedConfiguration): IGenerateOptions {
    const actions = configuration.fill(actionsOf(configuration, 'detect', 'generate', 'analyze'));
    const generate = actions.generate ?? {};

    return {
      resourceRoot: requireResourceRoots(configuration),
      type: actions.detect?.type as ResourceMode,
      strategy: generate.strategy ?? '',
      locales: generate.locales ?? [],
      baseLocale: generate.baseLocale ?? '',
      apiKey: generate.apiKey ?? '',
      model: generate.model ?? '',
      temperature: generate.temperature ?? 0,
      chunkSize: generate.chunkSize ?? 0,
      limit: generate.limit ?? null,
      instructions: generate.instructions ?? '',
      onlyNew: generate.onlyNew ?? false,
      scope: generate.scope ?? 'all',
      namespace: generate.namespace ?? '',
      identicalKeys: actions.analyze?.identicalKeys ?? [],
      identicalValues: actions.analyze?.identicalValues ?? [],
      ...(generate.keys?.length ? { keys: generate.keys } : {}),
      ...(generate.localeInstructions ? { localeInstructions: generate.localeInstructions } : {}),
      ...(generate.keepRawOutput ? { keepRawOutput: true } : {}),
      dumpModels: configuration.options.verbose ?? false,
    };
  }

  /**
   * Decides what a command does with its change set. A dry run wins over a review set in a file, but asking for both
   * on one command line is a mistake.
   *
   * @public
   * @throws EngineError when the arguments ask for both a dry run and a review.
   */
  export function writeMode(configuration: IResolvedConfiguration): WriteMode {
    const source = (key: string): string | undefined =>
      configuration.settings.find((setting) => setting.key === key)?.source.kind;
    const { dryRun, review } = configuration.options;

    if (source('dryRun') === 'arguments' && source('review') === 'arguments') {
      return resolveWriteMode(dryRun, review);
    }

    return resolveWriteMode(dryRun, !dryRun && review);
  }

  /**
   * Returns the write mode of options that a caller passes straight to the engine.
   *
   * @public
   * @throws EngineError when both a dry run and a review are requested.
   */
  export function resolveWriteMode(
    dryRun: boolean | undefined,
    review: boolean | undefined,
  ): WriteMode {
    if (dryRun && review) {
      throw new EngineError(
        'invalid-arguments',
        'A dry run writes nothing, so it cannot leave a change set for review. Choose one of the two.',
      );
    }

    if (dryRun) {
      return 'dry-run';
    }

    return review ? 'review' : 'apply';
  }

  /**
   * @private
   */
  function requireResourceRoots(configuration: IResolvedConfiguration): Array<string> {
    if (configuration.resourceRoots.every((root) => root === '')) {
      throw new EngineError(
        'invalid-arguments',
        'No catalogs to work on. Pass --resource-root or set actions.detect.resourceRoot in the configuration.',
      );
    }

    return configuration.resourceRoots;
  }

  /**
   * @private
   */
  function actionsOf<TAction extends keyof NonNullable<ProjectOptions['actions']>>(
    configuration: IResolvedConfiguration,
    ...names: Array<TAction>
  ): Pick<NonNullable<ProjectOptions['actions']>, TAction> {
    return Object.fromEntries(
      names.map((name) => [name, configuration.options.actions?.[name]]),
    ) as Pick<NonNullable<ProjectOptions['actions']>, TAction>;
  }
}
