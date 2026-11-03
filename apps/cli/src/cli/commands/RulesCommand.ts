// #region Imports

import { bold, gray, type IFileSystem, type ILogger, type IProgramArg } from '@pixel-brewery/utilities';
import { RuleSeveritySchema, type ChangeSetSummary, type CommandReport, type RulePackProblem } from '@pixel-brewery/wortlaut-contracts';
import { CommandOptions, EngineError, type IEngineOutcome, type IEngineInit, type IInspectedPack, type IPackScope, type IPackStatus, type IResolvedConfiguration, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { RULES_COMMAND_ARGS } from '../arguments/RulesCommandArgs.js';
import { DEFAULT_RULES_COMMAND_ARGS_CONFIG, type IRulesCommandArgsConfig } from '../arguments/configurations/IRulesCommandArgsConfig.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * What an update did with one pack.
 */
interface IPackUpdateLine {
    pack: string;
    name: string;
    available: boolean;
    summary: string;
    failure: string | null;
    rules: Array<{ id: string; change: string }>;
    changeSet: ChangeSetSummary | null;
}

/**
 * What a check says about a pack.
 */
interface IPackCheckReport {
    source: string;
    id: string;
    name: string;
    version: string | null;
    commit: string | null;
    hash: string;
    rules: Array<{ id: string; description: string; severity: string }>;
    access: IInspectedPack['access'];
}

/**
 * The rule packs from a command line, on the path the app takes: `list`, `add <source>`, `check [<source>]`, `update [<pack>]`,
 * `enable <pack>`, `disable <pack>` and `severity <rule> <severity>`. Nothing of a pack runs here, and every write is a change
 * set.
 *
 * @internal
 */
export class RulesCommand extends EngineCommand<IRulesCommandArgsConfig, unknown> {

    // #region Fields

    private readonly _engineInit: Partial<IEngineInit>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RulesCommand` class.
     *
     * @public
     */
    public constructor(config: IRulesCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem, engineInit: Partial<IEngineInit> = {}) {
        super(config, logger, fileSystem);

        this._engineInit = engineInit;
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'rules';
    }

    public get args(): Array<IProgramArg> {
        return RULES_COMMAND_ARGS;
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
    protected override get defaults(): IRulesCommandArgsConfig {
        return DEFAULT_RULES_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public override configure(config: IRulesCommandArgsConfig): IRulesCommandArgsConfig {
        const [action, subject, value] = this.positionals;

        return Object.assign(super.configure(config), {
            action: action ?? DEFAULT_RULES_COMMAND_ARGS_CONFIG.action,
            subject: subject ?? DEFAULT_RULES_COMMAND_ARGS_CONFIG.subject,
            value: value ?? DEFAULT_RULES_COMMAND_ARGS_CONFIG.value
        });
    }

    /**
     * @protected
     * @override
     */
    protected override engineInit(): Partial<IEngineInit> {
        return this._engineInit;
    }

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<unknown> | { result: unknown; report: CommandReport }> {
        const configuration = this.resolveConfiguration(engine);

        switch (this.config.action) {
            case 'list':
                return Promise.resolve(this.report('rules.list', engine.rulePacks.status(this.cwd, configuration)));
            case 'check':
                return this.check(engine, configuration);
            case 'add':
                return this.add(engine, configuration);
            case 'update':
                return this.update(engine, configuration);
            case 'enable':
            case 'disable':
                return engine.rulePacks.setEnabled(this.scopeOf(engine, configuration), this.requireSubject('pack'), this.config.action === 'enable', this.writeMode);
            case 'severity':
                return this.setSeverity(engine, configuration);
            default:
                throw new EngineError('invalid-arguments', `Unknown action '${this.config.action}'. Use list, add <source>, check [<source>], update [<pack>], enable <pack>, disable <pack> or severity <rule> <error|warning|off>.`);
        }
    }

    /**
     * @protected
     * @override
     */
    protected override presentText(report: CommandReport): void {
        switch (report.command) {
            case 'rules.list':
                this.presentPacks(report.data as Array<IPackStatus>);
                break;
            case 'rules.check':
                this.presentCheck(report.data as IPackCheckReport);
                break;
            case 'rules.update.all':
                this.presentUpdates(report.data as Array<IPackUpdateLine>);
                break;
            default:
        }
    }

    /**
     * An update that could not reach its source fails the command, and the other packs are still handled.
     *
     * @protected
     * @override
     */
    protected override failsOn(report: CommandReport): boolean {
        return report.command === 'rules.update.all' && (report.data as Array<IPackUpdateLine>).some((line) => line.failure !== null);
    }

    /**
     * @private
     */
    private get writeMode(): ReturnType<typeof CommandOptions.resolveWriteMode> {
        return CommandOptions.resolveWriteMode(this.config.dryRun, this.config.review);
    }

    /**
     * Checks a source, or verifies what the lock file pins. A failed check fails the command.
     *
     * @private
     */
    private async check(engine: WortlautEngine, configuration: IResolvedConfiguration): Promise<{ result: unknown; report: CommandReport }> {
        if (!this.config.subject) {
            const statuses = engine.rulePacks.status(this.cwd, configuration);
            const refused = statuses.filter((status) => status.state === 'refused');

            if (refused.length > 0) {
                throw new EngineError('rule-pack-refused', refused.map((status) => `The rule pack ${status.name} was refused: ${status.reason}`).join('\n'));
            }

            return this.report('rules.list', statuses);
        }

        const outcome = await engine.rulePacks.inspect(this.config.subject, this.cwd);

        if (outcome.problem) {
            throw this.failureOf(outcome.problem);
        }

        return this.report('rules.check', this.describeCheck(outcome.source, outcome.pack as IInspectedPack));
    }

    /**
     * @private
     */
    private async add(engine: WortlautEngine, configuration: IResolvedConfiguration): Promise<IEngineOutcome<Array<string>>> {
        const outcome = await engine.rulePacks.inspect(this.requireSubject('source'), this.cwd);

        if (outcome.problem) {
            throw this.failureOf(outcome.problem);
        }

        return engine.rulePacks.install(outcome.pack as IInspectedPack, this.scopeOf(engine, configuration), this.writeMode);
    }

    /**
     * Updates what has changed at its source. A changed pack never updates itself: this command is the decision.
     *
     * @private
     */
    private async update(engine: WortlautEngine, configuration: IResolvedConfiguration): Promise<{ result: unknown; report: CommandReport }> {
        const scope = this.scopeOf(engine, configuration);
        const pinned = engine.rulePacks.status(this.cwd, configuration).filter((status) => status.state !== 'built-in' && status.hash !== null)
            .map((status) => status.id);
        const packs = this.config.subject ? [this.config.subject] : pinned;
        const lines = new Array<IPackUpdateLine>();

        for (const pack of packs) {
            const preview = await engine.rulePacks.previewUpdate(scope, pack);
            let changeSet: ChangeSetSummary | null = null;

            if (preview.available && preview.next) {
                changeSet = (await engine.rulePacks.applyUpdate(preview.next, scope, pack, this.writeMode)).report.changeSet;
            }

            lines.push({ pack, name: preview.name, available: preview.available, summary: preview.summary, failure: preview.failure, rules: preview.rules.map((rule) => ({ id: rule.id, change: rule.change })), changeSet });
        }

        return this.report('rules.update.all', lines);
    }

    /**
     * @private
     */
    private setSeverity(engine: WortlautEngine, configuration: IResolvedConfiguration): Promise<IEngineOutcome<Array<string>>> {
        const severity = RuleSeveritySchema.safeParse(this.config.value);

        if (!severity.success) {
            throw new EngineError('invalid-arguments', 'Use severity <rule> <error|warning|off>.');
        }

        return engine.rulePacks.setSeverity(this.scopeOf(engine, configuration), this.requireSubject('rule'), severity.data, this.writeMode);
    }

    /**
     * @private
     */
    private scopeOf(engine: WortlautEngine, configuration: IResolvedConfiguration): IPackScope {
        return engine.rulePacks.scopeAt(this.cwd, configuration);
    }

    /**
     * @private
     */
    private requireSubject(name: string): string {
        if (!this.config.subject) {
            throw new EngineError('invalid-arguments', `Name the ${name}: wortlaut rules ${this.config.action} <${name}>.`);
        }

        return this.config.subject;
    }

    /**
     * @private
     */
    private failureOf(problem: RulePackProblem): EngineError {
        return new EngineError('rule-pack-invalid', [problem.message, ...problem.details.map((detail) => `  ${detail}`)].join('\n'));
    }

    /**
     * @private
     */
    private describeCheck(source: string, pack: IInspectedPack): IPackCheckReport {
        return {
            source,
            id: pack.manifest.id,
            name: pack.manifest.name,
            version: pack.version,
            commit: pack.commit,
            hash: pack.hash,
            rules: pack.manifest.rules.map((rule) => ({ id: rule.id, description: rule.description, severity: rule.severity ?? 'warning' })),
            access: pack.access
        };
    }

    /**
     * @private
     */
    private presentPacks(statuses: ReadonlyArray<IPackStatus>): void {
        for (const status of statuses) {
            const pin = status.commit ? `commit ${status.commit.slice(0, 7)}` : status.version ? `version ${status.version}` : '';

            this.logger.log(`${bold(status.name)} ${status.state} ${gray([status.source, pin, status.hash ?? ''].filter((part) => part.length > 0).join(' · '))}`);

            if (status.reason) {
                this.logger.log(`  ${status.reason}`);
            }

            for (const rule of status.rules) {
                this.logger.log(`  ${rule.id} ${gray(rule.severity)}`);
            }
        }
    }

    /**
     * @private
     */
    private presentCheck(check: IPackCheckReport): void {
        this.logger.log(`${bold(check.name)} ${check.version ?? ''} ${gray(check.source)}`);

        if (check.commit) {
            this.logger.log(`Commit ${check.commit}`);
        }

        this.logger.log(`Content hash ${check.hash}`);

        for (const rule of check.rules) {
            this.logger.log(`  ${rule.id} ${gray(rule.severity)} ${rule.description}`);
        }

        this.logger.log(`What this pack may do: reads ${check.access.readsCatalogs ? 'your catalogs' : 'nothing'}, ${check.access.readsSource ? 'reads source code' : 'does not read source code'}, ${check.access.network ? 'uses the network' : 'no network access'}, ${check.access.ai ? 'uses AI' : 'does not use AI'}. Nothing of it ran.`);
    }

    /**
     * @private
     */
    private presentUpdates(lines: ReadonlyArray<IPackUpdateLine>): void {
        if (lines.length === 0) {
            this.logger.log('No rule pack is pinned here.');
        }

        for (const line of lines) {
            if (line.failure) {
                this.logger.error(`${line.name}: ${line.failure}`);
            } else if (!line.available) {
                this.logger.log(`${line.name}: ${line.summary}`);
            } else {
                this.logger.log(`${bold(line.name)}: ${line.summary}`);

                for (const rule of line.rules) {
                    this.logger.log(`  ${rule.change} ${rule.id}`);
                }

                this.presentChangeSet(line.changeSet);
            }
        }
    }

    /**
     * @private
     */
    private presentChangeSet(changeSet: ChangeSetSummary | null): void {
        if (!changeSet) {
            return;
        }

        const files = changeSet.files.map((file) => file.displayPath).join(', ');

        switch (changeSet.state) {
            case 'proposed':
                this.logger.log(`Dry run: ${changeSet.files.length} file(s) would be written: ${files}`);
                break;
            case 'pending':
                this.logger.log(`Change set ${changeSet.id} waits for review with ${changeSet.files.length} file(s): ${files}`);
                this.logger.log(`Write it with: wortlaut changes apply ${changeSet.id}`);
                break;
            default:
                this.logger.log(`${changeSet.files.length} file(s) written: ${files}`);
        }
    }

    /**
     * @private
     */
    private report(command: string, data: unknown): { result: unknown; report: CommandReport } {
        return {
            result: data,
            report: { ok: true, command, runId: null, state: 'succeeded', writeMode: null, changeSet: null, findings: [], data }
        };
    }

    // #endregion

}
