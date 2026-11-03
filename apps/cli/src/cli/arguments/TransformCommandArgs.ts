// #region Imports

import type { IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG } from './configurations/ITransformCommandArgsConfig.js';

// #endregion

// #region Arguments

/**
 * Argument to specify the types to transform the resources into.
 *
 * @internal
 */
export const TYPES_ARG: IProgramArg = {
    alias: ['-ts', '--types'],
    options: {
        type: (value: string) => value.split(',').map((type) => type.trim())
            .filter((type) => type.length > 0),
        required: false,
        default: DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG.types,
        metavar: 'Array',
        help: 'A comma-separated list of the types to transform the resources into.'
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
        default: DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG.type,
        metavar: 'string',
        help: 'The type of the resources to read.',
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
        default: DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG.resourceRoot,
        metavar: 'string',
        help: 'The directory that contains the resources.'
    }
};

/**
 * Aggregate export for all transform command arguments.
 *
 * @internal
 */
export const TRANSFORM_COMMAND_ARGS = [
    ...CLI_ARGS,
    TYPES_ARG,
    TYPE_ARG,
    RESOURCE_ROOT_ARG,
    REVIEW_ARG
];

// #endregion
