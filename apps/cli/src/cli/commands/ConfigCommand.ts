// #region Imports

import { bold, gray, type IFileSystem, type ILogger, type IProgramArg } from '@pixel-brewery/utilities';
import type { CommandReport, EffectiveSetting } from '@pixel-brewery/wortlaut-contracts';
import { CommandOptions, EngineError, type IEngineOutcome, type IResolvedConfiguration, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { CONFIG_COMMAND_ARGS } from '../arguments/ConfigCommandArgs.js';
import { DEFAULT_CONFIG_COMMAND_ARGS_CONFIG, type IConfigCommandArgsConfig } from '../arguments/configurations/IConfigCommandArgsConfig.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that shows the effective settings of a project with their sources, and changes one of them.
 *
 * @internal
 */
export class ConfigCommand extends EngineCommand<IConfigCommandArgsConfig, unknown> {

    // #region Ctor

    /**
     * Constructs a new instance of the `ConfigCommand` class.
     *
     * @public
     */
    public constructor(config: IConfigCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'config';
    }

    public get args(): Array<IProgramArg> {
        return CONFIG_COMMAND_ARGS;
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
    protected override get defaults(): IConfigCommandArgsConfig {
        return DEFAULT_CONFIG_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public override configure(config: IConfigCommandArgsConfig): IConfigCommandArgsConfig {
        const [action, key, value] = this.positionals;

        return Object.assign(super.configure(config), {
            action: action ?? DEFAULT_CONFIG_COMMAND_ARGS_CONFIG.action,
            key: key ?? DEFAULT_CONFIG_COMMAND_ARGS_CONFIG.key,
            value: value ?? DEFAULT_CONFIG_COMMAND_ARGS_CONFIG.value
        });
    }

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<unknown> | { result: unknown; report: CommandReport }> {
        const configuration = this.resolveConfiguration(engine);

        switch (this.config.action) {
            case 'list':
                return Promise.resolve(this.report('config.list', configuration.settings));
            case 'get':
                return Promise.resolve(this.report('config.get', this.readSettings(configuration)));
            case 'set':
                return this.setValue(engine, configuration);
            default:
                throw new EngineError('invalid-arguments', `Unknown action '${this.config.action}'. Use list, get <key> or set <key> <value>.`);
        }
    }

    /**
     * @protected
     * @override
     */
    protected override presentText(report: CommandReport): void {
        if (Array.isArray(report.data)) {
            for (const setting of report.data as Array<EffectiveSetting>) {
                this.logger.log(`${bold(setting.key)} = ${JSON.stringify(setting.value)} ${gray(`(${this.describeSource(setting)})`)}`);
            }
        }
    }

    /**
     * @private
     */
    private setValue(engine: WortlautEngine, configuration: IResolvedConfiguration): Promise<IEngineOutcome<string>> {
        if (!this.config.key || !this.positionals[2] && !this.config.value) {
            throw new EngineError('invalid-arguments', 'Use set <key> <value>.');
        }

        return engine.setConfiguration(configuration, {
            cwd: this.cwd,
            options: { key: this.config.key, value: this.parseValue(this.config.value) },
            writeMode: CommandOptions.resolveWriteMode(this.config.dryRun, this.config.review)
        });
    }

    /**
     * A value is JSON when it reads as JSON, and text otherwise.
     *
     * @private
     */
    private parseValue(text: string): unknown {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    /**
     * @private
     */
    private readSettings(configuration: IResolvedConfiguration): Array<EffectiveSetting> {
        const { key } = this.config;
        const settings = configuration.settings.filter((setting) => setting.key === key || setting.key.startsWith(`${key}.`));

        if (!key || settings.length === 0) {
            throw new EngineError('invalid-arguments', `Wortlaut has no setting '${key}'.`);
        }

        return settings;
    }

    /**
     * @private
     */
    private report(command: string, data: Array<EffectiveSetting>): { result: unknown; report: CommandReport } {
        return {
            result: data,
            report: { ok: true, command, runId: null, state: 'succeeded', writeMode: null, changeSet: null, findings: [], data }
        };
    }

    /**
     * @private
     */
    private describeSource(setting: EffectiveSetting): string {
        return setting.source.file ? `${setting.source.kind}: ${setting.source.file}` : setting.source.kind;
    }

    // #endregion

}
