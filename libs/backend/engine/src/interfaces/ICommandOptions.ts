// #region Imports

import type { Presets, ResourceMode, ResourceType } from '@pixel-brewery/wortlaut-core';
import type { ProjectOptions, RuleSeverity } from '@pixel-brewery/wortlaut-contracts';
import type { ResourceGeneratorKeyScope } from '@pixel-brewery/wortlaut-ai';

// #endregion

/**
 * The resolved options of `sort`.
 *
 * @public
 */
export interface ISortOptions {
  resourceRoot: string | Array<string>;
  type: ResourceMode;
  order: 'asc' | 'desc';
}

/**
 * The resolved options of `transform`.
 *
 * @public
 */
export interface ITransformOptions {
  resourceRoot: string | Array<string>;
  type: ResourceMode;
  types: Array<ResourceType>;
}

/**
 * The resolved options of `detect`.
 *
 * @public
 */
export interface IDetectOptions {
  root: string;
  preset: Presets | '';
  type: ResourceMode;
  resourceKeyPrefix: string;
  resourceKeySuffix: string;

  /**
   * Leaves test and specification files out.
   */
  skipTests?: boolean;
}

/**
 * The resolved options of a scan that goes on to change sources: it reads the catalogs for reuse hints as well.
 *
 * @public
 */
export interface IDetectScanOptions extends IDetectOptions {
  resourceRoot: string | Array<string>;
  baseLocale: string;
  skipTests: boolean;
}

/**
 * The resolved options of `analyze`.
 *
 * @public
 */
export interface IAnalyzeOptions extends IDetectOptions {
  resourceRoot: string | Array<string>;
  rules: Array<string>;
  usedKeys: Array<string>;
  baseLocale: string;
  identicalKeys: Array<string>;
  identicalValues: Array<string>;

  /**
   * Each of these locales must have at least one translation key in the catalog roots.
   */
  expectedLocales?: ReadonlyArray<string>;

  /**
   * What each rule is worth. A rule that is `off` does not run, unless this run names it.
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

  /**
   * `rules` is what this one run asked for, so exactly those run. Otherwise `rules` comes from the configuration, which names
   * built-in rules: the rules of the packs of the lock file run next to them.
   */
  explicitRules?: boolean;
}

/**
 * The resolved options of `generate`. The API key is used for the provider and never stored; an empty one falls back to
 * the provider's environment variable.
 *
 * @public
 */
export interface IGenerateOptions {
  resourceRoot: string | Array<string>;
  type: ResourceMode;
  strategy: string;
  locales: Array<string>;
  baseLocale: string;
  apiKey: string;
  model: string;
  temperature: number;
  chunkSize: number;
  limit: number | null;
  instructions: string | Array<string>;
  onlyNew: boolean;
  scope: ResourceGeneratorKeyScope;
  namespace: string;
  identicalKeys: Array<string>;
  identicalValues: Array<string>;

  /**
   * Only these keys.
   */
  keys?: Array<string>;

  /**
   * Instructions per locale, on top of those for all locales.
   */
  localeInstructions?: Readonly<Record<string, string>>;

  /**
   * Keeps each answer of the model in a temporary file.
   */
  keepRawOutput?: boolean;

  /**
   * Writes the raw models into a temporary file, to analyze a wrong serialization.
   */
  dumpModels: boolean;
}

/**
 * The options of `init`.
 *
 * @public
 */
export interface IInitOptions {
  /**
   * The settings for the new file.
   */
  settings: ProjectOptions;

  /**
   * Replaces a configuration file that exists.
   */
  force: boolean;
}
