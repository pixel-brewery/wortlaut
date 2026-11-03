// #region Imports

import { ResourceMode, type ResourceType } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface ITransformCommandArgsConfig extends ICliArgsConfig {

    // #region Properties

    types: Array<ResourceType>;

    /**
     * The base directory or directories where the resource files are stored.
     *
     * This is the directory or directories where the resources are located.
     * It can be a single directory or an array of directories.
     *
     * @example './locales' or ['./locales', './translations']
     * @default ''
     */
    resourceRoot: string | Array<string>;

    /**
     * The type of the resource.
     *
     * @default ResourceMode.Json
     */
    type: ResourceMode;

    /**
     * Leaves the change set in the review list.
     *
     * @default false
     */
    review: boolean;

    // #endregion
}

/**
 * @internal
 */
export const DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG: ITransformCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG,
    types: [],
    resourceRoot: '',
    type: ResourceMode.Json,
    review: false
};
