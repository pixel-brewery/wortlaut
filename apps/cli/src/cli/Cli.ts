// #region Imports

import { Container, type IFileSystem, type ILogger, Program } from '@pixel-brewery/utilities';
import { LiteralFileSystem } from '@pixel-brewery/wortlaut-engine';
import { APPLY_ARG, SKIP_TESTS_ARG } from './arguments/DetectCommandArgs.js';
import { FORCE_ARG } from './arguments/InitCommandArgs.js';
import { ONLY_NEW_ARG } from './arguments/GenerateCommandArgs.js';
import { DEFAULT_AI_COMMAND_ARGS_CONFIG } from './arguments/configurations/IAiCommandArgsConfig.js';
import { DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG } from './arguments/configurations/IAnalyzeCommandArgsConfig.js';
import { DEFAULT_CATALOG_COMMAND_ARGS_CONFIG } from './arguments/configurations/ICatalogCommandArgsConfig.js';
import { DEFAULT_CHANGES_COMMAND_ARGS_CONFIG } from './arguments/configurations/IChangesCommandArgsConfig.js';
import { DEFAULT_CLI_ARGS_CONFIG, type ICliArgsConfig } from './arguments/configurations/ICliArgsConfig.js';
import { DEFAULT_CONFIG_COMMAND_ARGS_CONFIG } from './arguments/configurations/IConfigCommandArgsConfig.js';
import { DEFAULT_DETECT_COMMAND_ARGS_CONFIG } from './arguments/configurations/IDetectCommandArgsConfig.js';
import { DEFAULT_GENERATE_COMMAND_ARGS_CONFIG } from './arguments/configurations/IGenerateCommandArgsConfig.js';
import { DEFAULT_INFO_COMMAND_ARGS_CONFIG } from './arguments/configurations/IInfoCommandArgsConfig.js';
import { DEFAULT_INIT_COMMAND_ARGS_CONFIG } from './arguments/configurations/IInitCommandArgsConfig.js';
import { DEFAULT_MCP_COMMAND_ARGS_CONFIG } from './arguments/configurations/IMcpCommandArgsConfig.js';
import { DEFAULT_RULES_COMMAND_ARGS_CONFIG } from './arguments/configurations/IRulesCommandArgsConfig.js';
import { DEFAULT_SORT_COMMAND_ARGS_CONFIG } from './arguments/configurations/ISortCommandArgsConfig.js';
import { DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG } from './arguments/configurations/ITransformCommandArgsConfig.js';
import { CACHE_ARG, CLI_ARGS, DEBUG_ARG, DRY_RUN_ARG, EMOJI_ARG, JSON_ARG, REVIEW_ARG } from './CliArgs.js';
import { CommandLine } from './CommandLine.js';
import { packageVersion } from './PackageVersion.js';
import { AiCommand } from './commands/AiCommand.js';
import { AnalyzeCommand } from './commands/AnalyzeCommand.js';
import { CatalogCommand } from './commands/CatalogCommand.js';
import { ChangesCommand } from './commands/ChangesCommand.js';
import { ConfigCommand } from './commands/ConfigCommand.js';
import { DetectCommand } from './commands/DetectCommand.js';
import { GenerateCommand } from './commands/GenerateCommand.js';
import { InfoCommand } from './commands/InfoCommand.js';
import { InitCommand } from './commands/InitCommand.js';
import { McpCommand } from './commands/McpCommand.js';
import { RulesCommand } from './commands/RulesCommand.js';
import { SortCommand } from './commands/SortCommand.js';
import { TransformCommand } from './commands/TransformCommand.js';

// #endregion

/**
 * @internal
 */
export class Cli extends Program<ICliArgsConfig> {

    // #region Ctor

    public constructor() {
        super({
            moduleName: 'wortlaut',
            prog: 'wortlaut',
            description: 'wortlaut CLI',
            version: packageVersion(),
            addHelp: true,
            debug: true
        });

        this.config
            .assign(DEFAULT_CLI_ARGS_CONFIG);

        this.args
            .register(...CLI_ARGS);

        const infoCtorFn: () => ConstructorParameters<typeof InfoCommand> = () => [{ ...DEFAULT_INFO_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const analyzeCtorFn: () => ConstructorParameters<typeof AnalyzeCommand> = () => [{ ...DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const generateCtorFn: () => ConstructorParameters<typeof GenerateCommand> = () => [{ ...DEFAULT_GENERATE_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const sortCtorFn: () => ConstructorParameters<typeof SortCommand> = () => [{ ...DEFAULT_SORT_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const transformCtorFn: () => ConstructorParameters<typeof TransformCommand> = () => [{ ...DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const detectCtorFn: () => ConstructorParameters<typeof DetectCommand> = () => [{ ...DEFAULT_DETECT_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const initCtorFn: () => ConstructorParameters<typeof InitCommand> = () => [{ ...DEFAULT_INIT_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const configCtorFn: () => ConstructorParameters<typeof ConfigCommand> = () => [{ ...DEFAULT_CONFIG_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const catalogCtorFn: () => ConstructorParameters<typeof CatalogCommand> = () => [{ ...DEFAULT_CATALOG_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const aiCtorFn: () => ConstructorParameters<typeof AiCommand> = () => [{ ...DEFAULT_AI_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const rulesCtorFn: () => ConstructorParameters<typeof RulesCommand> = () => [{ ...DEFAULT_RULES_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const changesCtorFn: () => ConstructorParameters<typeof ChangesCommand> = () => [{ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];
        const mcpCtorFn: () => ConstructorParameters<typeof McpCommand> = () => [{ ...DEFAULT_MCP_COMMAND_ARGS_CONFIG }, Container.instance.get<ILogger>('logger'), Container.instance.get<IFileSystem>('fileSystem')];

        this.commands
            .register('info', InfoCommand, infoCtorFn)
            .register('ai', AiCommand, aiCtorFn)
            .register('analyze', AnalyzeCommand, analyzeCtorFn)
            .register('generate', GenerateCommand, generateCtorFn)
            .register('sort', SortCommand, sortCtorFn)
            .register('transform', TransformCommand, transformCtorFn)
            .register('detect', DetectCommand, detectCtorFn)
            .register('init', InitCommand, initCtorFn)
            .register('config', ConfigCommand, configCtorFn)
            .register('changes', ChangesCommand, changesCtorFn)
            .register('catalog', CatalogCommand, catalogCtorFn)
            .register('rules', RulesCommand, rulesCtorFn)
            .register('mcp', McpCommand, mcpCtorFn);
    }

    // #endregion

    // #region Methods

    /**
     * Prepares a command line for the program's parser, so that a boolean flag can stand without a value anywhere.
     *
     * @public
     * @param argv The command line.
     * @returns The command line for the parser.
     */
    public static normalizeArguments(argv: ReadonlyArray<string>): Array<string> {
        return CommandLine.normalizeBooleanFlags(argv, [EMOJI_ARG, DEBUG_ARG, DRY_RUN_ARG, JSON_ARG, REVIEW_ARG, CACHE_ARG, ONLY_NEW_ARG, FORCE_ARG, SKIP_TESTS_ARG, APPLY_ARG]);
    }

    /**
     * @public
     * @override
     */
    public override init(): Promise<this> {
        // cosmiconfigSync(Cli._name, {cache: true,ignoreEmptySearchPlaces: true});
        Container.instance
            .provideFactory('logger', () => console)
            .provideFactory('fileSystem', () => new LiteralFileSystem());

        return super.init();
    }

    // public exec(command: string, args: unknown): Promise<void> {
    //     return this.run(command, args);
    // }

    /**
     * Keeps the exit code a command that finished asked for, such as an analysis with errors.
     *
     * @public
     * @override
     */
    public override exit(code: number): never {
        return super.exit(code === 0 ? Number(process.exitCode ?? 0) : code);
    }

    /**
     * With JSON output, stdout belongs to the one document of the command. A command that finished with a failing exit code says
     * so in the last line as well.
     *
     * @protected
     * @override
     */
    protected override onSuccess(stdout: string, startedAt: number): void {
        if (!CommandLine.asksForJson(process.argv)) {
            if (process.exitCode) {
                this.onError(new Error(stdout), stdout, startedAt);
            } else {
                super.onSuccess(stdout, startedAt);
            }
        }
    }

    // #endregion

}
