// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IRulesCommandArgsConfig extends ICliArgsConfig {
  // #region Properties

  /**
   * The sub-command: `list`, `add`, `check`, `update`, `enable`, `disable` or `severity`. Read from the positionals.
   *
   * @default 'list'
   */
  action: string;

  /**
   * What it is about: a source, a pack or a rule. Read from the positionals.
   *
   * @default ''
   */
  subject: string;

  /**
   * The new severity, for `severity`. Read from the positionals.
   *
   * @default ''
   */
  value: string;

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
export const DEFAULT_RULES_COMMAND_ARGS_CONFIG: IRulesCommandArgsConfig = {
  ...DEFAULT_CLI_ARGS_CONFIG,
  action: 'list',
  subject: '',
  value: '',
  review: false,
};
