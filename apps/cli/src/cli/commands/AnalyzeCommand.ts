// #region Imports

import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import type { CommandReport } from '@pixel-brewery/wortlaut-contracts';
import type { IAnalyzerRuleResult } from '@pixel-brewery/wortlaut-core';
import { CommandOptions, type IAnalysisGate, type IEngineOutcome, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { ANALYZE_COMMAND_ARGS } from '../arguments/AnalyzeCommandArgs';
import { DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG, type IAnalyzeCommandArgsConfig } from '../arguments/configurations/IAnalyzeCommandArgsConfig';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * @internal
 */
export class AnalyzeCommand extends EngineCommand<IAnalyzeCommandArgsConfig, Array<IAnalyzerRuleResult>> {

    // #region Ctor

    /**
     * Constructs a new instance of the `AnalyzeCommand` class.
     *
     * @public
     */
    public constructor(config: IAnalyzeCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'analyze';
    }

    public get args(): Array<IProgramArg> {
        return ANALYZE_COMMAND_ARGS;
    }

    /**
     * @protected
     * @override
     */
    protected override get settingNames(): Readonly<Record<string, string>> {
        return {
            dryRun: 'dryRun',
            debug: 'verbose',
            type: 'actions.detect.type',
            rules: 'actions.analyze.rules',
            resourceRoot: 'actions.detect.resourceRoot',
            root: 'actions.detect.root',
            preset: 'actions.detect.preset',
            resourceKeyPrefix: 'actions.detect.resourceKey.prefix',
            resourceKeySuffix: 'actions.detect.resourceKey.suffix',
            usedKeys: 'actions.analyze.usedKeys',
            baseLocale: 'actions.analyze.baseLocale',
            identicalKeys: 'actions.analyze.identicalKeys',
            identicalValues: 'actions.analyze.identicalValues'
        };
    }

    /**
     * @protected
     * @override
     */
    protected override get defaults(): IAnalyzeCommandArgsConfig {
        return DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<Array<IAnalyzerRuleResult>>> {
        const configuration = this.resolveConfiguration(engine);

        return engine.analyze({
            cwd: this.cwd,
            options: CommandOptions.forAnalyze(configuration),
            writeMode: CommandOptions.writeMode(configuration),
            ...this.cacheRequest
        });
    }

    /**
     * Sums up what the severities say, for a repository that uses them.
     *
     * @protected
     * @override
     */
    protected override presentText(report: CommandReport): void {
        const gate = (report.data as { gate?: IAnalysisGate }).gate;

        if (gate) {
            this.logger.log(`${gate.errors} with severity error, ${gate.warnings} with severity warning, ${gate.refusedPacks.length} refused rule packs.`);
        }
    }

    /**
     * The exit code follows the severity once a repository uses severities or packs: a finding of severity `error` and a pack
     * that was refused fail the command, and a warning does not. Without those a finding keeps exiting with 0, as it always did.
     *
     * @protected
     * @override
     */
    protected override failsOn(report: CommandReport): boolean {
        const gate = (report.data as { gate?: IAnalysisGate }).gate;

        return gate !== undefined && (gate.errors > 0 || gate.refusedPacks.length > 0);
    }

    // #endregion

}
