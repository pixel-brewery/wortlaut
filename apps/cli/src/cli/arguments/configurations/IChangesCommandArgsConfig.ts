// #region Imports

import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IChangesCommandArgsConfig extends ICliArgsConfig {

    // #region Properties

    /**
     * The sub-command: `list`, `show`, `apply` or `discard`. Read from the positionals.
     *
     * @default 'list'
     */
    action: string;

    /**
     * The id of the change set. Read from the positionals.
     *
     * @default ''
     */
    id: string;

    // #endregion

}

/**
 * @internal
 */
export const DEFAULT_CHANGES_COMMAND_ARGS_CONFIG: IChangesCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG,
    action: 'list',
    id: ''
};
