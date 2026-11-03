// #region Imports

import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';

// #endregion

/**
 * The arguments of the `rules` command, besides its positionals `list`, `add <source>`, `check [<source>]`, `update [<pack>]`,
 * `enable <pack>`, `disable <pack>` and `severity <rule> <error|warning|off>`.
 *
 * @internal
 */
export const RULES_COMMAND_ARGS = [
    ...CLI_ARGS,
    REVIEW_ARG
];
