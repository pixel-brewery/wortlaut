// #region Imports

import { bold, Formatter, t, type IFileSystem, type ILogger, type IProgramArg } from '@pixel-brewery/utilities';
import type { CommandReport } from '@pixel-brewery/wortlaut-contracts';
import type { IEngineOutcome, IInfoResult, WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { DEFAULT_INFO_COMMAND_ARGS_CONFIG, type IInfoCommandArgsConfig } from '../arguments/configurations/IInfoCommandArgsConfig.js';
import { INFO_COMMAND_ARGS } from '../arguments/InfoCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that print OS information.
 *
 * @internal
 */
export class InfoCommand extends EngineCommand<IInfoCommandArgsConfig, IInfoResult> {

    // #region Ctor

    /**
     * Constructs a new instance of the `InfoCommand` class.
     *
     * @public
     */
    public constructor(config: IInfoCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'info';
    }

    public get args(): Array<IProgramArg> {
        return INFO_COMMAND_ARGS;
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
    protected override get defaults(): IInfoCommandArgsConfig {
        return DEFAULT_INFO_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<IInfoResult>> {
        return engine.info(this.cwd);
    }

    /**
     * @protected
     * @override
     */
    protected override presentText(report: CommandReport): void {
        const info = report.data as IInfoResult;

        this.logger.log(t`${bold('Platform')}    ${info.platform}`);
        this.logger.log(t`${bold('    Arch')}    ${info.arch}`);
        this.logger.log(t`${bold('    Cpus')}    ${info.cpus}`);
        this.logger.log(t`${bold('     Ram')}    ${Formatter.formatBytes(info.totalMemory, 0)}`);
    }

    // #endregion

}
