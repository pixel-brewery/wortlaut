// #region Imports

import { DEFAULT_PROJECT_OPTIONS } from '@pixel-brewery/wortlaut-contracts';
import { type Presets, ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig';

// #endregion

/**
 * Represents the configuration for the analyze command arguments.
 * This interface extends the base CLI arguments configuration and adds
 * additional properties specific to resource analysis.
 *
 * @internal
 */
export interface IAnalyzeCommandArgsConfig extends ICliArgsConfig {
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
   * A list of rules to apply during the analysis of resources.
   *
   * If the list is empty, all available rules will be applied by default.
   * Rules can include checks for missing translations, consistency,
   * or adherence to specific standards.
   *
   * @example ['missing-translations', 'key-consistency']
   * @default []
   */
  rules: Array<string>;

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
   * The base locale of the resources used for translation.
   *
   * This represents the default or source language of the translations.
   * For example, if the project is initially created in English and translations are generated
   * from this base language, you would set `baseLocale` to `'en'`. The `missing-translations` rule reports
   * the values of the other locales that are identical to the value of this locale.
   *
   * @example 'en'
   * @default 'en'
   */
  baseLocale: string;

  /**
   * Patterns of keys whose value may be identical to the base locale's value in every locale, for the
   * `missing-translations` rule. `*` matches any sequence of characters.
   *
   * @example ['loc.integrations.*.name']
   * @default []
   */
  identicalKeys: Array<string>;

  /**
   * Values that need no translation and may be identical to the base locale's value in every locale, for the
   * `missing-translations` rule, such as brand names, product names, units or abbreviations.
   *
   * @example ['PDF', 'DATEV']
   * @default []
   */
  identicalValues: Array<string>;

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
   * Keys that count as used although no source below `root` mentions them,
   * for example keys that another library composes at runtime.
   * Each entry matches the whole key, case-sensitively: an exact key; a glob where `*` matches within one segment
   * and, at the end, the rest of the key, `**` any number of segments, `?` one character other than `.` and
   * `{a,b}` either alternative; or a regular expression written as `/expression/flags`.
   *
   * Keys the sources contain as string literals, and keys they compose with a template literal
   * (`` `loc.status.${state}` ``) or by concatenating a literal that ends with a dot (`'loc.status.' + state`),
   * are found without a pattern.
   *
   * @example ['loc.api.error.*', 'loc.orders.{open,closed}.label', '/loc\\.step\\d+\\.title/']
   * @default []
   */
  usedKeys: Array<string>;

  // #endregion
}

/**
 * The default configuration for the analyze command arguments.
 *
 * This object contains default values for each property defined in `IAnalyzeCommandArgsConfig`.
 * You can modify or extend this configuration based on your specific needs.
 *
 * @internal
 */
export const DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG: IAnalyzeCommandArgsConfig = {
  ...DEFAULT_CLI_ARGS_CONFIG,
  type: ResourceMode.Json,
  rules: [
    // Define default rules here. Uncomment and add additional rules as needed.
    // 'missing-translation',
    // 'key-consistency',
    // 'empty-values',
    // 'unused-keys'
  ],
  resourceRoot: '',
  root: '',
  preset: '',
  resourceKeyPrefix: '',
  resourceKeySuffix: '',
  usedKeys: [],
  identicalKeys: [],
  identicalValues: [],
  baseLocale: DEFAULT_PROJECT_OPTIONS.actions.analyze.baseLocale,
};
