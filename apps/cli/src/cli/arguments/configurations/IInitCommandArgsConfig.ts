// #region Imports

import { type Presets, ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface IInitCommandArgsConfig extends ICliArgsConfig {

    // #region Properties

    root: string;
    resourceRoot: string;
    preset: Presets | '';
    type: ResourceMode;
    baseLocale: string;
    locales: Array<string>;
    resourceKeyPrefix: string;
    resourceKeySuffix: string;

    /**
     * Replaces a configuration file that exists.
     *
     * @default false
     */
    force: boolean;

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
export const DEFAULT_INIT_COMMAND_ARGS_CONFIG: IInitCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG,
    root: '',
    resourceRoot: '',
    preset: '',
    type: ResourceMode.Json,
    baseLocale: '',
    locales: [],
    resourceKeyPrefix: '',
    resourceKeySuffix: '',
    force: false,
    review: false
};
