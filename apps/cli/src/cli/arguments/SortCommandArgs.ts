// #region Imports

import type { IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_SORT_COMMAND_ARGS_CONFIG } from './configurations/ISortCommandArgsConfig.js';

// #endregion

// #region Arguments

/**
 * Argument to specify the sort order of the keys.
 *
 * @internal
 */
export const ORDER_ARG: IProgramArg = {
    alias: ['-o', '--order'],
    options: {
        required: false,
        default: DEFAULT_SORT_COMMAND_ARGS_CONFIG.order,
        metavar: 'string',
        help: 'The sort order of the keys.',
        choices: ['asc', 'desc']
    }
};

/**
 * Argument to specify the type of the resources.
 *
 * @internal
 */
export const TYPE_ARG: IProgramArg = {
    alias: ['-t', '--type'],
    options: {
        required: false,
        default: DEFAULT_SORT_COMMAND_ARGS_CONFIG.type,
        metavar: 'string',
        help: 'The type of the resources to sort.',
        choices: ['json', 'resx', 'po']
    }
};

/**
 * Argument to specify the directory of the resources.
 *
 * @internal
 */
export const RESOURCE_ROOT_ARG: IProgramArg = {
    alias: ['-rr', '--resource-root'],
    options: {
        required: false,
        default: DEFAULT_SORT_COMMAND_ARGS_CONFIG.resourceRoot,
        metavar: 'string',
        help: 'The directory that contains the resources.'
    }
};

/**
 * Aggregate export for all sort command arguments.
 *
 * @internal
 */
export const SORT_COMMAND_ARGS = [
    ...CLI_ARGS,
    ORDER_ARG,
    TYPE_ARG,
    RESOURCE_ROOT_ARG,
    REVIEW_ARG
];

// #endregion
