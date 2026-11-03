// #region Imports

import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import type { ProjectOptions } from '@pixel-brewery/wortlaut-contracts';
import { CommandOptions, PathResolver, type IEngineOutcome, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { DEFAULT_INIT_COMMAND_ARGS_CONFIG, type IInitCommandArgsConfig } from '../arguments/configurations/IInitCommandArgsConfig.js';
import { INIT_COMMAND_ARGS } from '../arguments/InitCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that creates the configuration file of a project.
 *
 * @internal
 */
export class InitCommand extends EngineCommand<IInitCommandArgsConfig, string> {

    // #region Ctor

    /**
     * Constructs a new instance of the `InitCommand` class.
     *
     * @public
     */
    public constructor(config: IInitCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'init';
    }

    public get args(): Array<IProgramArg> {
        return INIT_COMMAND_ARGS;
    }

    /**
     * @protected
     * @override
     */
    protected override get settingNames(): Readonly<Record<string, string>> {
        return {};
    }

    /**
     * @protected
     * @override
     */
    protected override get defaults(): IInitCommandArgsConfig {
        return DEFAULT_INIT_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<string>> {
        return engine.init({
            cwd: this.cwd,
            options: { settings: this.createSettings(), force: this.config.force },
            writeMode: CommandOptions.resolveWriteMode(this.config.dryRun, this.config.review)
        });
    }

    /**
     * Creates the settings of the file. The arguments are relative to the working directory, like those of every command,
     * and `resourceRoot` in a configuration file is relative to `root`.
     *
     * @private
     */
    private createSettings(): ProjectOptions {
        const { root, resourceRoot, preset, type, baseLocale, locales, resourceKeyPrefix, resourceKeySuffix } = this.config;

        return {
            actions: {
                detect: {
                    type,
                    ...(root ? { root } : {}),
                    ...(resourceRoot ? { resourceRoot: [PathResolver.toOption(this.cwd, root, resourceRoot)] } : {}),
                    ...(preset ? { preset } : {}),
                    ...(resourceKeyPrefix || resourceKeySuffix
                        ? { resourceKey: { ...(resourceKeyPrefix ? { prefix: resourceKeyPrefix } : {}), ...(resourceKeySuffix ? { suffix: resourceKeySuffix } : {}) } }
                        : {})
                },
                ...(baseLocale ? { analyze: { baseLocale } } : {}),
                ...(baseLocale || locales.length > 0
                    ? { generate: { ...(baseLocale ? { baseLocale } : {}), ...(locales.length > 0 ? { locales } : {}) } }
                    : {})
            }
        };
    }

    // #endregion

}
