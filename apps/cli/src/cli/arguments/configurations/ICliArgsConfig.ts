/**
 * @internal
 */
export interface ICliArgsConfig extends Record<string, unknown> {

    // #region Properties

    /**
     * The emoji parameter ensures that Emoji will displayed.
     *
     * @default false
     */
    emoji: boolean;

    /**
     * The debug parameter shows extended debug logging.
     *
     * @default false
     */
    debug: boolean;

    /**
     * The current working directory where the command will be executed.
     *
     * @default ''
     */
    cwd: string;

    /**
     * The dry run parameter ensures that no changes are made.
     *
     * @default false
     */
    dryRun: boolean;

    /**
     * Prints one JSON document on stdout instead of text. Logs go to stderr.
     *
     * @default false
     */
    json: boolean;

    /**
     * The Nx target to read the configuration from, by default the one that runs the Wortlaut executor.
     *
     * @default ''
     */
    target: string;

    /**
     * The Nx configuration to read, by default the target's default configuration.
     *
     * @default ''
     */
    configuration: string;

    /**
     * Reuses the results of files that did not change.
     */
    cache: boolean;

    /**
     * The folder of the cache, relative to the working directory.
     */
    cacheDir: string;

    // #endregion

}

/**
 * @internal
 */
export const DEFAULT_CLI_ARGS_CONFIG: ICliArgsConfig = {
    emoji: false,
    debug: false,
    cwd: '',
    dryRun: false,
    json: false,
    target: '',
    configuration: '',
    cache: false,
    cacheDir: ''
};
