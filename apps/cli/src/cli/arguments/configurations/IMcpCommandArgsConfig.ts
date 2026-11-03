// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IMcpCommandArgsConfig extends ICliArgsConfig {
    // nothing
}

/**
 * @internal
 */
export const DEFAULT_MCP_COMMAND_ARGS_CONFIG: IMcpCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG
};
