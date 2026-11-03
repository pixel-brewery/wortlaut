// #region Imports

import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';

// #endregion

/**
 * The arguments of the `config` command, besides its positionals `list`, `get <key>` and `set <key> <value>`.
 *
 * @internal
 */
export const CONFIG_COMMAND_ARGS = [
    ...CLI_ARGS,
    REVIEW_ARG
];
