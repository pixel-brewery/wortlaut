// #region Imports

import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './ICliArgsConfig.js';

// #endregion

/**
 * @internal
 */
export interface ICatalogCommandArgsConfig extends ICliArgsConfig {

    // #region Properties

    /**
     * The sub-command: `set`, `comment`, `delete`, `merge` or `add-locale`. Read from the positionals.
     *
     * @default ''
     */
    action: string;

    /**
     * What the sub-command works on. Read from the positionals.
     *
     * @default []
     */
    words: Array<string>;

    /**
     * The locale of `set` and `comment`.
     *
     * @default ''
     */
    locale: string;

    /**
     * The folder of the catalogs.
     *
     * @default ''
     */
    resourceRoot: string;

    /**
     * The format of the catalogs.
     *
     * @default ResourceMode.Json
     */
    type: ResourceMode;

    /**
     * The base locale.
     *
     * @default 'en'
     */
    baseLocale: string;

    // #endregion

}

/**
 * @internal
 */
export const DEFAULT_CATALOG_COMMAND_ARGS_CONFIG: ICatalogCommandArgsConfig = {
    ...DEFAULT_CLI_ARGS_CONFIG,
    action: '',
    words: [],
    locale: '',
    resourceRoot: '',
    type: ResourceMode.Json,
    baseLocale: 'en'
};
