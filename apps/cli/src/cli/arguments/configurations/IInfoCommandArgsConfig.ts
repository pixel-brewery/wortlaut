// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IInfoCommandArgsConfig extends ICliArgsConfig {
    // nothing
}

/**
 * @internal
 */
export const DEFAULT_INFO_COMMAND_ARGS_CONFIG: IInfoCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG
};
