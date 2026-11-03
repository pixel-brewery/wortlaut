// #region Imports

import { Boolean, type IProgramArg } from '@pixel-brewery/utilities';
import { DEFAULT_CLI_ARGS_CONFIG } from './arguments/configurations/ICliArgsConfig';

// #endregion

// #region Arguments

/**
 * Argument to enable or disable emoji display.
 *
 * @internal
 */
export const EMOJI_ARG: IProgramArg = {
    alias: ['-e', '--emoji'], // Long alias changed to kebab-case
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.emoji,
        metavar: 'boolean',
        help: 'Enables or disables emoji display in the output.'
    }
};

/**
 * Argument to enable extended debug logging.
 *
 * @internal
 */
export const DEBUG_ARG: IProgramArg = {
    alias: ['-d', '--debug'], // Long alias changed to kebab-case
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.debug,
        metavar: 'boolean',
        help: 'Enables extended debug logging.'
    }
};

/**
 * Argument to enable dry run mode.
 *
 * @internal
 */
export const DRY_RUN_ARG: IProgramArg = {
    alias: ['-dr', '--dry-run'], // Long alias changed to kebab-case
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.dryRun,
        metavar: 'boolean',
        help: 'Enables dry run mode to prevent any changes.'
    }
};

/**
 * Argument to specify the current working directory.
 *
 * @internal
 */
export const CWD_ARG: IProgramArg = {
    alias: ['-c', '--cwd'], // Short alias shortened to -c, long alias changed to kebab-case
    options: {
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.cwd,
        metavar: 'string',
        help: 'Specifies the current working directory for command execution.'
    }
};

/**
 * Argument to print JSON instead of text.
 *
 * @internal
 */
export const JSON_ARG: IProgramArg = {
    alias: '--json',
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.json,
        metavar: 'boolean',
        help: 'Prints one JSON document on stdout for scripts and CI. Logs go to stderr.'
    }
};

/**
 * Argument to choose the Nx target that the configuration is read from.
 *
 * @internal
 */
export const TARGET_ARG: IProgramArg = {
    alias: '--target',
    options: {
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.target,
        metavar: 'string',
        help: 'The Nx target to read the configuration from. By default the one that runs the Wortlaut executor.'
    }
};

/**
 * Argument to choose the Nx configuration.
 *
 * @internal
 */
export const CONFIGURATION_ARG: IProgramArg = {
    alias: '--configuration',
    options: {
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.configuration,
        metavar: 'string',
        help: 'The Nx configuration to read. By default the default configuration of the target.'
    }
};

/**
 * Argument to leave the change set in the review list instead of applying it.
 *
 * @internal
 */
export const REVIEW_ARG: IProgramArg = {
    alias: '--review',
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: false,
        metavar: 'boolean',
        help: 'Leaves the change set in the review list. `wortlaut changes apply <id>` writes it.'
    }
};

/**
 * Argument to reuse the results of files that did not change.
 *
 * @internal
 */
export const CACHE_ARG: IProgramArg = {
    alias: '--cache',
    options: {
        type: (value: string) => Boolean.parse(value),
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.cache,
        metavar: 'boolean',
        help: 'Reuses the results of files that did not change. It changes no result, and a dry run only reads the cache.'
    }
};

/**
 * Argument to name the folder of the cache.
 *
 * @internal
 */
export const CACHE_DIR_ARG: IProgramArg = {
    alias: '--cache-dir',
    options: {
        type: String,
        required: false,
        default: DEFAULT_CLI_ARGS_CONFIG.cacheDir,
        metavar: 'path',
        help: 'The folder of the cache, relative to the working directory. By default `.wortlaut/cache`.'
    }
};

// #endregion

// #region Exports

/**
 * Aggregate export for all CLI arguments.
 *
 * @internal
 */
export const CLI_ARGS = [
    CACHE_ARG,
    CACHE_DIR_ARG,
    EMOJI_ARG,
    DEBUG_ARG,
    DRY_RUN_ARG,
    CWD_ARG,
    JSON_ARG,
    TARGET_ARG,
    CONFIGURATION_ARG
];

// #endregion
