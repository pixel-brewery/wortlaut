// #region Imports

import { DEFAULT_PROJECT_OPTIONS } from '@pixel-brewery/wortlaut-contracts';
import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface ISortCommandArgsConfig extends ICliArgsConfig {

    // #region Properties

    order: 'asc' | 'desc';

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
export const DEFAULT_SORT_COMMAND_ARGS_CONFIG: ISortCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG,
    order: DEFAULT_PROJECT_OPTIONS.actions.sort.order,
    resourceRoot: '',
    type: ResourceMode.Json,
    review: DEFAULT_PROJECT_OPTIONS.review
};
