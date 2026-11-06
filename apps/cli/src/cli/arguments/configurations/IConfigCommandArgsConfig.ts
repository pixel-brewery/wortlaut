// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IConfigCommandArgsConfig extends ICliArgsConfig {
  // #region Properties

  /**
   * The sub-command: `list`, `get` or `set`. Read from the positionals.
   *
   * @default 'list'
   */
  action: string;

  /**
   * The dotted name of a setting. Read from the positionals.
   *
   * @default ''
   */
  key: string;

  /**
   * The new value as text, for `set`. Read from the positionals.
   *
   * @default ''
   */
  value: string;

  /**
   * Leaves the change set of `set` in the review list.
   *
   * @default false
   */
  review: boolean;

  // #endregion
}

/**
 * @internal
 */
export const DEFAULT_CONFIG_COMMAND_ARGS_CONFIG: IConfigCommandArgsConfig = {
  ...DEFAULT_CLI_ARGS_CONFIG,
  action: 'list',
  key: '',
  value: '',
  review: false,
};
