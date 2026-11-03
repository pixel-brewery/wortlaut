// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig';

// #endregion

/**
 * @internal
 */
export type IAiCommandArgsConfig = ICliArgsConfig;

/**
 * @internal
 */
export const DEFAULT_AI_COMMAND_ARGS_CONFIG: IAiCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG
};
