// #region Imports

import { DEFAULT_PROJECT_OPTIONS } from '@pixel-brewery/wortlaut-contracts';
import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig';

// #endregion

/**
 * @internal
 */
export interface IGenerateCommandArgsConfig extends ICliArgsConfig {
  // #region Properties

  /**
   * The strategy to generate the resources.
   * It can be 'openai' or 'google' with an API key, or 'claude-code', 'codex' or 'opencode' with their own login.
   * Legacy aliases 'chatgpt' and 'gemini' are also supported.
   *
   * @default ''
   */
  strategy: string;

  /**
   * The locales to generate the resources.
   *
   * @default ['']
   */
  locales: Array<string>;

  /**
   * The base locale to generate the resources.
   * For Example: The 'Wortlaut' scanns for all resources in your project.
   *              The base locale is the locale that the AI will use to generate the resources.
   *
   * @default ''
   */
  baseLocale: string;

  /**
   * The API key for the AI.
   *
   * @default ''
   */
  apiKey: string;

  /**
   * The model that the AI will use.
   *
   * @default ''
   */
  model: string;

  /**
   * The temperature that the AI will use.
   *
   * @default 0
   */
  temperature: number;

  /**
   * The base directory or directories where the resource files are stored.
   *
   * This is the directory or directories where the resources are located.
   * It can be a single directory or an array of directories.
   *
   * @example './locales' or ['./locales', './translations']
   * @default ''
   */
  resourceRoot: string | Array<string>;

  /**
   * The type of the resource.
   *
   * @default ResourceMode.Json
   */
  type: ResourceMode;

  /**
   * The chunk size to generate the resources.
   *
   * @default 10
   */
  chunkSize: number;

  /**
   * The maximum number of models to process.
   *
   * @default null
   */
  limit: number | null;

  /**
   * Optional instructions to guide the generation process.
   *
   * @default ''
   */
  instructions: string | Array<string>;

  /**
   * If true, only new resources will be generated.
   *
   * @default false
   */
  onlyNew: boolean;

  /**
   * Which keys to translate: all, the new ones the target lacks, or the missing ones, which the target lacks or holds
   * identical to the base locale.
   *
   * @default 'all'
   */
  scope: 'all' | 'new' | 'missing';

  /**
   * Translates only the keys below this namespace.
   *
   * @default ''
   */
  namespace: string;

  /**
   * Translates only these keys.
   *
   * @default []
   */
  keys: Array<string>;

  /**
   * Leaves the change set in the review list.
   *
   * @default false
   */
  review: boolean;

  // #endregion
}

/**
 * @internal
 */
export const DEFAULT_GENERATE_COMMAND_ARGS_CONFIG: IGenerateCommandArgsConfig = {
  ...DEFAULT_CLI_ARGS_CONFIG,
  strategy: DEFAULT_PROJECT_OPTIONS.actions.generate.strategy,
  locales: [],
  apiKey: DEFAULT_PROJECT_OPTIONS.actions.generate.apiKey,
  model: DEFAULT_PROJECT_OPTIONS.actions.generate.model,
  temperature: DEFAULT_PROJECT_OPTIONS.actions.generate.temperature,
  resourceRoot: '',
  baseLocale: DEFAULT_PROJECT_OPTIONS.actions.generate.baseLocale,
  type: ResourceMode.Json,
  chunkSize: DEFAULT_PROJECT_OPTIONS.actions.generate.chunkSize,
  limit: DEFAULT_PROJECT_OPTIONS.actions.generate.limit,
  instructions: DEFAULT_PROJECT_OPTIONS.actions.generate.instructions,
  onlyNew: DEFAULT_PROJECT_OPTIONS.actions.generate.onlyNew,
  scope: DEFAULT_PROJECT_OPTIONS.actions.generate.scope,
  namespace: DEFAULT_PROJECT_OPTIONS.actions.generate.namespace,
  keys: [],
  review: DEFAULT_PROJECT_OPTIONS.review,
};
