// #region Imports

import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import type { IResourceTransformerResult } from '@pixel-brewery/wortlaut-core';
import { CommandOptions, type IEngineOutcome, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG, type ITransformCommandArgsConfig } from '../arguments/configurations/ITransformCommandArgsConfig';
import { TRANSFORM_COMMAND_ARGS } from '../arguments/TransformCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that transforms the resources.
 *
 * @internal
 */
export class TransformCommand extends EngineCommand<ITransformCommandArgsConfig, Array<IResourceTransformerResult>> {

    // #region Ctor

    /**
     * Constructs a new instance of the `TransformCommand` class.
     *
     * @public
     */
    public constructor(config: ITransformCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    /**
     * Gets the command name.
     *
     * @public
     * @readonly
     */
    public override get name(): string {
        return 'transform';
    }

    /**
     * Gets the optional arguments.
     *
     * @public
     * @readonly
     */
    public override get args(): Array<IProgramArg> | undefined {
        return TRANSFORM_COMMAND_ARGS;
    }

    /**
     * @protected
     * @override
     */
    protected override get settingNames(): Readonly<Record<string, string>> {
        return {
            dryRun: 'dryRun',
            review: 'review',
            debug: 'verbose',
            types: 'actions.transform.types',
            type: 'actions.detect.type',
            resourceRoot: 'actions.detect.resourceRoot'
        };
    }

    /**
     * @protected
     * @override
     */
    protected override get defaults(): ITransformCommandArgsConfig {
        return DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<Array<IResourceTransformerResult>>> {
        const configuration = this.resolveConfiguration(engine);

        return engine.transform({
            cwd: this.cwd,
            options: CommandOptions.forTransform(configuration),
            writeMode: CommandOptions.writeMode(configuration)
        });
    }

    // #endregion

}
