// #region Imports

import { type Presets, ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IDetectCommandArgsConfig extends ICliArgsConfig {
  // #region Properties

  /**
   * The type of the resource being analyzed.
   *
   * Determines the format of the resource, such as JSON or RESX.
   * This informs the tool which parser or handler should be used for the given resource type.
   *
   * @default ResourceMode.Json
   */
  type: ResourceMode;

  /**
   * The root directory to locate the used resources.
   *
   * This is typically the directory where the relevant project files, such as
   * TypeScript, HTML, or other source files, are located. The analyzer will search
   * for resources within this directory.
   *
   * @example './src'
   * @default ''
   */
  root: string;

  /**
   * The preset used to analyze the resources.
   *
   * Presets define a set of predefined rules and configurations for analyzing resources
   * within specific frameworks or libraries. For example, frameworks like Angular, React,
   * Vue, or Lit can have their own presets.
   *
   * If no preset is specified, a custom analysis can be configured using individual rules.
   *
   * @example 'angular'
   * @default ''
   */
  preset: Presets | '';

  /**
   * A prefix that is applied to resource keys.
   *
   * For example, if all resource keys in the project should start with `app.`
   * to distinguish them, you can set the prefix here.
   *
   * @example 'app.'
   * @default ''
   */
  resourceKeyPrefix: string;

  /**
   * A suffix that is applied to resource keys.
   *
   * For example, if you want all keys to end with `.text` for UI text resources,
   * you can set the suffix here.
   *
   * @example '.text'
   * @default ''
   */
  resourceKeySuffix: string;

  /**
   * The folder of the catalogs that `--apply` reads and adds new keys to.
   *
   * @default ''
   */
  resourceRoot: string;

  /**
   * The locale that `--apply` adds new keys to.
   *
   * @default 'en'
   */
  baseLocale: string;

  /**
   * Leaves test and specification files out.
   *
   * @default false
   */
  skipTests: boolean;

  /**
   * Replaces the hard-coded strings in the sources with keys, as one change set.
   *
   * @default false
   */
  apply: boolean;

  // #endregion
}

/**
 * @internal
 */
export const DEFAULT_DETECT_COMMAND_ARGS_CONFIG: IDetectCommandArgsConfig = {
  ...DEFAULT_CLI_ARGS_CONFIG,
  type: ResourceMode.Json,
  root: '',
  preset: '',
  resourceKeyPrefix: '',
  resourceKeySuffix: '',
  resourceRoot: '',
  baseLocale: 'en',
  skipTests: false,
  apply: false,
};
