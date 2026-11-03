// #region Imports

import { CLI_ARGS } from '../CliArgs.js';

// #endregion

/**
 * The arguments of the `changes` command, besides its positionals `list`, `show <id>`, `apply <id>` and `discard <id>`.
 *
 * @internal
 */
export const CHANGES_COMMAND_ARGS = [
    ...CLI_ARGS
];
