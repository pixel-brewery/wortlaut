// #region Imports

import type { IResourceGeneratorResult } from '@pixel-brewery/wortlaut-ai';
import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import { isLocalAssistant, type LocalAssistants } from '@pixel-brewery/wortlaut-ai';
import { CommandOptions, EngineError, type IEngineInit, type IEngineOutcome, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { createCliAssistants, createLocalStrategies } from '../ai/CliProviders.js';
import { DEFAULT_GENERATE_COMMAND_ARGS_CONFIG, type IGenerateCommandArgsConfig } from '../arguments/configurations/IGenerateCommandArgsConfig';
import { GENERATE_COMMAND_ARGS } from '../arguments/GenerateCommandArgs';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * @internal
 */
export class GenerateCommand extends EngineCommand<IGenerateCommandArgsConfig, Array<IResourceGeneratorResult>> {

    // #region Fields

    private _assistants: LocalAssistants | null = null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `GenerateCommand` class.
     *
     * @public
     */
    public constructor(config: IGenerateCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'generate';
    }

    public get args(): Array<IProgramArg> {
        return GENERATE_COMMAND_ARGS;
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
            strategy: 'actions.generate.strategy',
            locales: 'actions.generate.locales',
            baseLocale: 'actions.generate.baseLocale',
            apiKey: 'actions.generate.apiKey',
            model: 'actions.generate.model',
            temperature: 'actions.generate.temperature',
            type: 'actions.detect.type',
            resourceRoot: 'actions.detect.resourceRoot',
            chunkSize: 'actions.generate.chunkSize',
            limit: 'actions.generate.limit',
            instructions: 'actions.generate.instructions',
            onlyNew: 'actions.generate.onlyNew',
            scope: 'actions.generate.scope',
            namespace: 'actions.generate.namespace',
            keys: 'actions.generate.keys'
        };
    }

    /**
     * @protected
     * @override
     */
    protected override get defaults(): IGenerateCommandArgsConfig {
        return DEFAULT_GENERATE_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * Composes the assistant a run asks for. Only this surface knows it: the engine receives it.
     *
     * @protected
     * @override
     */
    protected override engineInit(): Partial<IEngineInit> {
        this._assistants = createCliAssistants();

        return { strategies: createLocalStrategies(this._assistants) };
    }

    /**
     * @protected
     * @override
     */
    protected override async run(engine: WortlautEngine): Promise<IEngineOutcome<Array<IResourceGeneratorResult>>> {
        const configuration = this.resolveConfiguration(engine);
        const assistant = configuration.options.actions?.generate?.strategy ?? '';

        if (this._assistants && isLocalAssistant(assistant)) {
            const { state, message } = await this._assistants.status(assistant);

            if (state === 'not-installed' || state === 'signed-out') {
                await this._assistants.dispose();
                throw new EngineError('provider-not-ready', message ?? `${assistant} is not installed on this computer.`);
            }
        }

        const stop = new AbortController();
        const onInterrupt = (): void => stop.abort();

        // Ctrl+C stops the run cleanly: it writes nothing, and what it finished stays in the review list.
        process.once('SIGINT', onInterrupt);

        try {
            return await engine.generate({
                cwd: this.cwd,
                options: CommandOptions.forGenerate(configuration),
                writeMode: CommandOptions.writeMode(configuration),
                signal: stop.signal
            });
        } finally {
            process.off('SIGINT', onInterrupt);
            await this._assistants?.dispose();
        }
    }

    // #endregion

}
