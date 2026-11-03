// #region Imports

import { basename, resolve } from 'node:path';
import type { AiDefaultsChanges, AiKeyNames, AnalyzeOverview, AnalyzeRow, AnalyzeRuleResult, ChangeSet, CommandReport, DetectApplyRequest, DetectRow, DetectSettings, ExceptionListName, Exceptions, GenerateInput, OutputRow, ProjectOptions, ProjectRecord, ProjectSettingsChanges, RunRecord, RunResult, RunStartRequest, RunOutput, TransformFormat, TransformOverview, WriteMode, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import { ProjectOptionsSchema } from '@pixel-brewery/wortlaut-contracts';
import { BUILT_IN_RULE_SEVERITIES, fillRuleMessage, foundItemsOf, ResourceAnalyzer, type IAnalyzerRuleResult, type IDeclarativeRuleData, type IResourceInfo, type IResourceTransformerResult, type ResourceMode, type ResourceType } from '@pixel-brewery/wortlaut-core';
import type { IResultCacheRequest } from '../cache/ResultCache.js';
import type { CatalogService } from '../catalogs/CatalogService.js';
import type { ReviewService } from '../changes/ReviewService.js';
import { CommandOptions } from '../configuration/CommandOptions.js';
import { CONFIG_FILE_NAME, type IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import type { GenerateService } from '../generate/GenerateService.js';
import type { IAnalyzeOptions, IDetectScanOptions, ISortOptions, ITransformOptions } from '../interfaces/ICommandOptions.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { CommandPrinter } from '../printing/CommandPrinter.js';
import type { ProjectService } from '../projects/ProjectService.js';
import { describeAnalysis } from '../projects/ProjectSummaryBuilder.js';
import { RulePackLoader } from '../rulepacks/RulePackLoader.js';
import { RuleSettings } from '../rulepacks/RuleSettings.js';
import type { CommandRunner, IEngineOutcome, IRunListener } from '../runs/CommandRunner.js';
import { RunProjection } from '../runs/RunProjection.js';
import type { RunStore } from '../runs/RunStore.js';
import type { TestLab } from '../testlab/TestLab.js';
import { AnalyzeUseCase } from '../usecases/AnalyzeUseCase.js';
import { CatalogEditUseCase, type CatalogEdit } from '../usecases/CatalogEditUseCase.js';
import { ConfigUpdateUseCase } from '../usecases/ConfigUpdateUseCase.js';
import { DetectApplyUseCase } from '../usecases/DetectApplyUseCase.js';
import { DetectScanUseCase, projectScan, type IDetectScan } from '../usecases/DetectScanUseCase.js';
import { InitUseCase } from '../usecases/InitUseCase.js';
import { SortUseCase } from '../usecases/SortUseCase.js';
import { TransformUseCase } from '../usecases/TransformUseCase.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';

// #endregion

/**
 * The most rows a rule hands to a view.
 */
const MAX_RULE_ROWS = 500;

/**
 * The longest preview of a file.
 */
const MAX_PREVIEW_LENGTH = 128 * 1024;

/**
 * The longest message of a rule. Some rules list every key they found.
 */
const MAX_MESSAGE_LENGTH = 400;

/**
 * The most finished scans that stay around to apply from.
 */
const MAX_SCANS = 8;

/**
 * The formats a catalog can convert into.
 */
const FORMATS: ReadonlyArray<Omit<TransformFormat, 'enabled'>> = [
    { id: 'json', name: 'JSON', description: 'Plain JSON catalogs, nested by the segments of their keys.' },
    { id: 'ts', name: 'TypeScript', description: 'A generated class per locale, with typed keys in source order.' },
    { id: 'resx', name: 'RESX', description: 'XML resources for .NET projects.' },
    { id: 'po', name: 'PO', description: 'Gettext files for translation tools.' }
];

/**
 * What a run gets from the surface that hosts it.
 *
 * @public
 */
export interface IRunHosting {
    runId?: string;
    signal?: AbortSignal;
    listener?: IRunListener;

    /**
     * The value of Dry run when the run started. It keeps it, whatever happens to the switch meanwhile.
     */
    dryRun: boolean;

    /**
     * What a control that writes does, for a surface that cannot see that switch, such as MCP, whose level decides instead.
     */
    writeMode?: WriteMode;

    /**
     * Reuses results of files that did not change.
     */
    cache?: IResultCacheRequest;

    /**
     * Whether debug output joins the log of the run.
     */
    verbose?: boolean;

    /**
     * Takes what the run wants to write instead of writing it, for a batch that writes one change set per repository.
     */
    collectChanges?: (changeSet: ChangeSet, writeMode: WriteMode) => void;
}

/**
 * What a run of a batch wants to write.
 *
 * @public
 */
export interface IBatchChange {
    runId: string;
    projectId: string;
    changeSet: ChangeSet;
    writeMode: WriteMode;
}

/**
 * What became of a run of a batch once its repository was written.
 *
 * @public
 */
export interface IBatchWrite {
    runId: string;
    outcome: WriteOutcome | null;
    failure: string | null;
}

/**
 * The folders Settings: project chose through native dialogs, already checked to lie inside the project.
 *
 * @public
 */
export interface ISettingsFolders {
    sourceRoot: string | null;
    addResourceRoots: ReadonlyArray<string>;
}

/**
 * What the commands of a project are composed of.
 *
 * @internal
 */
export interface IProjectCommandsInit {
    runner: CommandRunner;
    runs: RunStore;
    workspaces: WorkspaceService;
    projects: ProjectService;
    catalogs: CatalogService;
    review: ReviewService;
    testLab: TestLab;
    generation: () => GenerateService;
    home: string;
}

/**
 * Runs the commands of a registered project for a surface that names projects by id: it resolves their options, runs the
 * use case, and hands back what a view shows. No path crosses this class except as a display value.
 *
 * @remarks
 * With dry run on, a control that writes leaves its change set in Review and nothing reaches the repository. A command that
 * only reads runs as a dry run.
 *
 * @public
 */
export class ProjectCommands {

    // #region Fields

    private readonly _init: IProjectCommandsInit;
    private readonly _scans: Map<string, IDetectScan>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProjectCommands` class.
     *
     * @param init What the commands are composed of.
     */
    public constructor(init: IProjectCommandsInit) {
        this._init = init;
        this._scans = new Map();
    }

    // #endregion

    // #region Methods

    /**
     * Runs a command of a project. A failure or a stop is part of the result, as the run record says.
     *
     * @public
     * @param request The command.
     * @param hosting What the run gets from its host.
     * @returns The result.
     */
    public async run(request: RunStartRequest, hosting: IRunHosting): Promise<RunResult> {
        const { project } = this._init.workspaces.requireProject(request.projectId);

        try {
            const configuration = this._init.projects.resolve(project);

            switch (request.command) {
                case 'detect':
                    return await this.scan(project, this.detectOptions(configuration, request.input), hosting);
                case 'analyze':
                    return await this.analyze(project, { ...CommandOptions.forAnalyze(configuration), rules: request.input.rules, explicitRules: true }, hosting);
                case 'transform':
                    return await this.transform(project, { ...CommandOptions.forTransform(configuration), types: request.input.types as Array<ResourceType> }, hosting);
                case 'generate':
                    return await this.generate(project, request.input, hosting);
                default:
                    return await this.sort(project, { ...CommandOptions.forSort(configuration), order: request.input.order }, hosting);
            }
        } catch (error) {
            return this.failureOf(project, request.command, hosting, error);
        }
    }

    /**
     * Runs a command of a project with the settings of its configuration, for Run on all projects.
     *
     * @public
     * @param projectId The project.
     * @param command The command.
     * @param hosting What the run gets from its host.
     * @returns The result.
     */
    public async runConfigured(projectId: string, command: 'detect' | 'analyze' | 'transform' | 'sort' | 'generate', hosting: IRunHosting): Promise<RunResult> {
        const { project } = this._init.workspaces.requireProject(projectId);

        try {
            const configuration = this._init.projects.resolve(project);

            switch (command) {
                case 'detect':
                    return await this.scan(project, CommandOptions.forDetectScan(configuration, true), hosting);
                case 'analyze':
                    return await this.analyze(project, CommandOptions.forAnalyze(configuration), hosting);
                case 'transform':
                    return await this.transform(project, CommandOptions.forTransform(configuration), hosting);
                case 'generate':
                    return await this.generate(project, await this._init.generation().configuredInput(projectId), hosting);
                default:
                    return await this.sort(project, CommandOptions.forSort(configuration), hosting);
            }
        } catch (error) {
            return this.failureOf(project, command, hosting, error);
        }
    }

    /**
     * Writes what the runs of a batch collected: one change set per repository, all of it or none. A run keeps its own record, which
     * takes over its files with what became of them. What failed or was stopped finished only part, so it waits in Review.
     *
     * @public
     * @param changes What the runs want to write.
     * @param wasStopped Whether the batch was stopped.
     * @returns What became of each run.
     */
    public writeBatch(changes: ReadonlyArray<IBatchChange>, wasStopped: boolean): Array<IBatchWrite> {
        const writes = new Array<IBatchWrite>();
        const byRepository = new Map<string, Array<IBatchChange>>();

        for (const change of changes) {
            const { workspace, project } = this._init.workspaces.requireProject(change.projectId);
            const repository = workspace.repositories.find((candidate) => PathResolver.isInside(candidate, project.folder)) ?? project.folder;

            byRepository.set(repository, [...byRepository.get(repository) ?? [], change]);
        }

        for (const [repository, entries] of byRepository) {
            const merged = this.mergeChanges(repository, entries, wasStopped);

            try {
                const written = this._init.runner.writeCollected(merged, entries.some((entry) => entry.writeMode === 'review') ? 'review' : 'apply');

                if (written.state === 'pending') {
                    this._init.review.removeRepeats(written);
                }

                for (const entry of entries) {
                    writes.push({ runId: entry.runId, outcome: this.noteBatchWrite(entry, written), failure: null });
                }
            } catch (error) {
                const failure = DisplayPath.scrub(error instanceof Error ? error.message : String(error), this._init.home);

                for (const entry of entries) {
                    writes.push({ runId: entry.runId, outcome: null, failure });
                }
            }
        }

        return writes;
    }

    /**
     * Starts a stored run again with the options it ran with, under the current dry run.
     *
     * @public
     * @param record The stored run.
     * @param projectId The project it belongs to.
     * @param hosting What the run gets from its host.
     * @returns The result.
     * @throws EngineError for a run that cannot be repeated.
     */
    public repeat(record: RunRecord, projectId: string, hosting: IRunHosting): Promise<RunResult> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const options = record.options;

        switch (record.command) {
            case 'detect':
                return this.scan(project, { resourceRoot: [], baseLocale: '', skipTests: false, ...options } as unknown as IDetectScanOptions, hosting);
            case 'analyze':
                return this.analyze(project, options as unknown as IAnalyzeOptions, hosting);
            case 'transform':
                return this.transform(project, options as unknown as ITransformOptions, hosting);
            case 'sort':
                return this.sort(project, options as unknown as ISortOptions, hosting);
            default:
                throw new EngineError('invalid-arguments', `A run of ${record.command} cannot start again.`);
        }
    }

    /**
     * Prints the command line that does the same as a command of the app.
     *
     * @public
     * @param request The command.
     * @returns The command line.
     */
    public print(request: RunStartRequest): string {
        const { project } = this._init.workspaces.requireProject(request.projectId);
        const configuration = this._init.projects.resolve(project);
        const print = (options: object): string => CommandPrinter.printCommand(request.command, options as Record<string, unknown>, project.folder);

        switch (request.command) {
            case 'detect':
                return print(this.detectOptions(configuration, request.input));
            case 'analyze':
                return print({ ...CommandOptions.forAnalyze(configuration), rules: request.input.rules });
            case 'transform':
                return print({ ...CommandOptions.forTransform(configuration), types: request.input.types });
            case 'generate':
                return this._init.generation().command(request.projectId, request.input).command;
            default:
                return print({ ...CommandOptions.forSort(configuration), order: request.input.order });
        }
    }

    /**
     * Returns what the settings of a scan start from.
     *
     * @public
     * @param projectId The project.
     * @returns The settings.
     */
    public detectSettings(projectId: string): DetectSettings {
        const { project } = this._init.workspaces.requireProject(projectId);
        const settings = this._init.projects.settings(projectId);

        return {
            presets: this._init.testLab.presets(),
            preset: settings.preset,
            sourceRoot: settings.sourceRoot,
            prefix: settings.prefix,
            suffix: settings.suffix,
            format: (this._init.projects.resolve(project).options.actions?.detect?.type ?? 'json') as ResourceMode
        };
    }

    /**
     * Applies rows of a scan to the source and the catalog, as one change set.
     *
     * @public
     * @param request The rows with their keys.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     * @throws EngineError when the scan is gone, or a file changed since the scan, naming the file.
     */
    public async applyDetect(request: DetectApplyRequest, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(request.projectId);
        const scan = this._scans.get(request.scanId);

        if (!scan) {
            throw new EngineError('invalid-arguments', 'This scan is no longer available. Scan again.');
        }

        const rows = request.rows.map(({ rowId, key }) => {
            const row = scan.rows.find((candidate) => candidate.id === rowId);

            if (!row) {
                throw new EngineError('invalid-arguments', 'This scan no longer holds that string. Scan again.');
            }

            return { row, key };
        });
        const configuration = this._init.projects.resolve(project);
        const outcome = await this._init.runner.run(new DetectApplyUseCase(rows), {
            cwd: project.folder,
            options: { ...CommandOptions.forDetectScan(configuration, true), count: rows.length },
            writeMode: this.writeModeOf(dryRun)
        });

        return this.finishWrite(outcome, project);
    }

    /**
     * Returns a hard-coded string of an earlier scan.
     *
     * @public
     * @param scanId The scan.
     * @param rowId The string.
     * @returns The row, or `null` when the scan is gone or does not hold it.
     */
    public scanRow(scanId: string, rowId: string): DetectRow | null {
        return this._scans.get(scanId)?.rows.find((row) => row.id === rowId) ?? null;
    }

    /**
     * Returns what Analyze shows before a run. The switches start from the configuration, and without a source root
     * `unused-keys` is off.
     *
     * @public
     * @param projectId The project.
     * @returns The overview.
     */
    public analyzeOverview(projectId: string): AnalyzeOverview {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const analyze = configuration.options.actions?.analyze;
        const configured = analyze?.rules ?? [];
        const hasSources = Boolean(configuration.root && configuration.options.actions?.detect?.preset);
        const summary = this._init.projects.summary(projectId);
        const last = this.lastAnalysis(project);
        const lastOf = (id: string): AnalyzeOverview['rules'][number]['last'] => {
            const result = last?.rules.find((rule) => rule.id === id);

            return result ? { passed: result.passed, locales: result.locales } : null;
        };
        const packs = RulePackLoader.load(project.folder, analyze?.disabledPacks ?? []);

        return {
            baseLocale: summary.baseLocale,
            locales: summary.locales.filter((locale) => locale.file !== null).map((locale) => locale.code),
            sourceRoot: summary.sourceRoot,
            rules: [
                ...new ResourceAnalyzer(QUIET_LOGGER).ruleNames.map((id) => {
                    const severity = RuleSettings.severityOf(configuration.options, id);

                    return {
                        id,
                        group: 'Built-in rules',
                        description: RuleSettings.descriptionOf(id),
                        enabled: severity !== 'off' && (configured.length > 0 ? configured.includes(id) : hasSources || id !== 'unused-keys'),
                        severity,
                        last: lastOf(id)
                    };
                }),
                ...packs.packs.flatMap((pack) => pack.manifest && pack.enabled
                    ? pack.manifest.rules.map((rule) => {
                        const severity = RuleSettings.severityOf(configuration.options, rule.id, rule.severity);

                        return { id: rule.id, group: `Pack: ${pack.manifest?.name}`, description: rule.description, enabled: severity !== 'off', severity, last: lastOf(rule.id) };
                    })
                    : [])
            ],
            exceptions: this.exceptions(projectId),
            refusedPacks: [
                ...packs.lock?.problem ? [{ name: basename(packs.lock.path), reason: DisplayPath.scrub(`This file cannot be read, so no pack of it runs: ${packs.lock.problem}`, this._init.home) }] : [],
                ...packs.packs.flatMap((pack) => pack.refusal ? [{ name: pack.entry.name, reason: DisplayPath.scrub(pack.refusal, this._init.home) }] : [])
            ]
        };
    }

    /**
     * Returns the exceptions of a project.
     *
     * @public
     * @param projectId The project.
     * @returns The three lists.
     */
    public exceptions(projectId: string): Exceptions {
        const { usedKeys, identicalKeys, identicalValues } = this._init.projects.settings(projectId);

        return { usedKeys, identicalKeys, identicalValues };
    }

    /**
     * Adds an entry to a list of exceptions, in the file the list comes from.
     *
     * @public
     * @param projectId The project.
     * @param list The list.
     * @param entry The entry.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public addException(projectId: string, list: ExceptionListName, entry: string, dryRun: boolean): Promise<WriteOutcome> {
        const current = this.exceptions(projectId)[list];

        if (current.includes(entry)) {
            return Promise.resolve({ state: 'unchanged', changeSetId: null, runId: null, files: [] });
        }

        return this.updateConfiguration(projectId, [{ key: `actions.analyze.${list}`, value: [...current, entry] }], dryRun);
    }

    /**
     * Lets one rule leave a key alone, for a rule without an exception list of its own, in the file the setting comes from.
     *
     * @public
     * @param projectId The project.
     * @param rule The rule.
     * @param key The key.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public addRuleException(projectId: string, rule: string, key: string, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const current = this._init.projects.resolve(project).options.actions?.analyze?.ruleExceptions?.[rule] ?? [];

        if (current.includes(key)) {
            return Promise.resolve({ state: 'unchanged', changeSetId: null, runId: null, files: [] });
        }

        return this.updateConfiguration(projectId, [{ key: `actions.analyze.ruleExceptions.${rule}`, value: [...current, key] }], dryRun);
    }

    /**
     * Saves Settings: project: every value goes into the file it comes from, as one change set.
     *
     * @public
     * @param projectId The project.
     * @param changes What changes.
     * @param folders The folders the user chose. Main checks that they lie inside the project.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public updateSettings(projectId: string, changes: ProjectSettingsChanges, folders: ISettingsFolders, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const edits = new Array<{ key: string; value: unknown }>();
        const set = (key: string, value: unknown): void => {
            if (value !== undefined) {
                edits.push({ key, value });
            }
        };

        set('actions.detect.preset', changes.preset === null ? '' : changes.preset);
        set('actions.detect.type', changes.format);
        set('actions.detect.resourceKey.prefix', changes.prefix);
        set('actions.detect.resourceKey.suffix', changes.suffix);
        set('actions.analyze.baseLocale', changes.baseLocale);
        set('actions.generate.baseLocale', changes.baseLocale);
        set('actions.analyze.usedKeys', changes.usedKeys);
        set('actions.analyze.identicalKeys', changes.identicalKeys);
        set('actions.analyze.identicalValues', changes.identicalValues);

        if (changes.targetLocales) {
            const base = changes.baseLocale ?? configuration.options.actions?.analyze?.baseLocale ?? 'en';

            set('actions.detect.languages', [base, ...changes.targetLocales]);
            set('actions.generate.locales', changes.targetLocales);
        }

        if (changes.rules) {
            this.addRuleEdits(configuration, changes.rules, set);
        }

        this.addPathEdits(project, configuration, changes, folders, set);

        return edits.length === 0
            ? Promise.resolve({ state: 'unchanged', changeSetId: null, runId: null, files: [] })
            : this.updateConfiguration(projectId, edits, dryRun);
    }

    /**
     * Writes the configuration file of a project that was set up in the app. Its choices stay in the profile until then, and
     * a configuration in the repository always wins over them.
     *
     * @public
     * @param project The project.
     * @param dryRun The value of Dry run.
     * @returns What happened, or `null` for a project that brings its configuration.
     */
    public async writeSetupConfiguration(project: ProjectRecord, dryRun: boolean): Promise<WriteOutcome | null> {
        if (project.kind !== 'setup' || !project.setup) {
            return null;
        }

        const outcome = await this._init.runner.run(new InitUseCase(), {
            cwd: project.folder,
            options: { settings: toConfigurationFile(project.folder, project.setup), force: false },
            writeMode: this.writeModeOf(dryRun)
        });

        return this.finishWrite(outcome, project);
    }

    /**
     * Applies an edit to the catalogs of a project, as a change set.
     *
     * @public
     * @param projectId The project.
     * @param edit The edit.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public async editCatalog(projectId: string, edit: CatalogEdit, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const scan = CommandOptions.forDetectScan(configuration, true);
        const outcome = await this._init.runner.run(new CatalogEditUseCase(), {
            cwd: project.folder,
            options: {
                root: scan.root,
                preset: scan.preset,
                type: scan.type,
                resourceKeyPrefix: scan.resourceKeyPrefix,
                resourceKeySuffix: scan.resourceKeySuffix,
                resourceRoot: scan.resourceRoot,
                baseLocale: scan.baseLocale,
                edit
            },
            writeMode: this.writeModeOf(dryRun)
        });

        return this.finishWrite(outcome, project);
    }

    /**
     * Saves the defaults of Settings: AI into the configuration of the repository, as one change set: only what changed, each
     * value in the file it comes from.
     *
     * @public
     * @param projectId The project.
     * @param changes The values.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public saveAiDefaults(projectId: string, changes: AiDefaultsChanges, dryRun: boolean): Promise<WriteOutcome> {
        const current = this._init.generation().defaults(projectId);
        const edits = new Array<{ key: string; value: unknown }>();
        const set = (name: string, before: unknown, after: unknown): void => {
            if (JSON.stringify(before) !== JSON.stringify(after)) {
                edits.push({ key: `actions.generate.${name}`, value: after });
            }
        };

        set('model', current.model, changes.model);
        set('temperature', current.temperature, changes.temperature);
        set('chunkSize', current.chunkSize, changes.chunkSize);
        set('limit', current.limit, changes.limit);
        set('instructions', current.instructions, changes.instructions);
        set('localeInstructions', current.localeInstructions, changes.localeInstructions);
        set('reviewBeforeWriting', current.safety.reviewBeforeWriting, changes.safety.reviewBeforeWriting);
        set('protectPlaceholders', current.safety.protectPlaceholders, changes.safety.protectPlaceholders);
        set('keepPartialResults', current.safety.keepPartialResults, changes.safety.keepPartialResults);
        set('keepRawOutput', current.safety.keepRawOutput, changes.safety.keepRawOutput);

        return edits.length === 0
            ? Promise.resolve({ state: 'unchanged', changeSetId: null, runId: null, files: [] })
            : this.updateConfiguration(projectId, edits, dryRun);
    }

    /**
     * Adds a target locale to the project, in the file its locales come from.
     *
     * @public
     * @param projectId The project.
     * @param locale The locale.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public addTargetLocale(projectId: string, locale: string, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configured = this._init.projects.resolve(project).options.actions?.generate?.locales ?? [];

        return configured.includes(locale)
            ? Promise.resolve({ state: 'unchanged', changeSetId: null, runId: null, files: [] })
            : this.updateSettings(projectId, { targetLocales: [...configured, locale] }, { sourceRoot: null, addResourceRoots: [] }, dryRun);
    }

    /**
     * Writes the accepted rows of a locale of a run, as one change set.
     *
     * @public
     * @param runId The run.
     * @param locale The locale.
     * @param dryRun The value of Dry run.
     * @returns What happened.
     */
    public async writeGenerated(runId: string, locale: string, dryRun: boolean): Promise<WriteOutcome> {
        const generation = this._init.generation();
        const { project } = this._init.workspaces.requireProject(generation.setupOf(runId).projectId);
        const outcome = await generation.write(runId, locale, dryRun);

        return outcome ? this.finishWrite(outcome, project) : { state: 'unchanged', changeSetId: null, runId: null, files: [] };
    }

    /**
     * Proposes names for rows of a scan. It stays a proposal: the view shows the names, and nothing is written.
     *
     * @public
     * @param projectId The project.
     * @param scanId The scan.
     * @param rowIds The rows.
     * @param signal Cancels it.
     * @returns The proposals.
     * @throws EngineError when the scan is gone.
     */
    public nameKeys(projectId: string, scanId: string, rowIds: ReadonlyArray<string>, signal?: AbortSignal): Promise<AiKeyNames> {
        const scan = this._scans.get(scanId);

        if (!scan) {
            throw new EngineError('invalid-arguments', 'This scan is no longer available. Scan again.');
        }

        const rows = scan.rows.filter((row) => rowIds.includes(row.id) && row.canApply);

        return this._init.generation().nameKeys(projectId, rows.map((row) => ({ id: row.id, value: row.value })), signal);
    }

    /**
     * Returns what Transform and sort shows before a run.
     *
     * @public
     * @param projectId The project.
     * @returns The overview.
     */
    public transformOverview(projectId: string): TransformOverview {
        const { project } = this._init.workspaces.requireProject(projectId);
        const actions = this._init.projects.resolve(project).options.actions;
        const format = (actions?.detect?.type ?? 'json') as ResourceMode;
        const configured = actions?.transform?.types ?? [];
        const { keyCount, fileCount, catalogs } = this._init.catalogs.stats(projectId);
        const first = catalogs[0];

        return {
            source: first ? first.name.replace(`.${first.locale}.`, '.*.') : `*.${format}`,
            formats: FORMATS.filter((candidate) => candidate.id !== format).map((candidate) => ({ ...candidate, enabled: configured.length > 0 ? configured.includes(candidate.id) : candidate.id !== 'po' })),
            order: actions?.sort?.order ?? 'asc',
            keyCount,
            fileCount
        };
    }

    /**
     * @private
     */
    private detectOptions(configuration: IResolvedConfiguration, input: { preset: string | null; suffix: string; skipTests: boolean }): IDetectScanOptions {
        const options = CommandOptions.forDetectScan(configuration, input.skipTests);

        return { ...options, preset: (input.preset ?? options.preset) as IDetectScanOptions['preset'], resourceKeySuffix: input.suffix };
    }

    /**
     * @private
     */
    private scan(project: ProjectRecord, options: IDetectScanOptions, hosting: IRunHosting): Promise<RunResult> {
        return this.settle(project, 'detect', hosting, async () => {
            const outcome = await this._init.runner.run(new DetectScanUseCase(), { cwd: project.folder, options, writeMode: hosting.dryRun ? 'dry-run' : 'apply', ...this.requestOf(hosting) });

            this.rememberScan({ ...outcome.result, scanId: outcome.report.runId ?? outcome.result.scanId });

            return { output: { command: 'detect', scan: projectScan({ ...outcome.result, scanId: outcome.report.runId ?? outcome.result.scanId }) }, outcome: null };
        });
    }

    /**
     * @private
     */
    private analyze(project: ProjectRecord, options: IAnalyzeOptions, hosting: IRunHosting): Promise<RunResult> {
        return this.settle(project, 'analyze', hosting, async () => {
            const outcome = await this._init.runner.run(new AnalyzeUseCase(), { cwd: project.folder, options, writeMode: hosting.dryRun ? 'dry-run' : 'apply', ...this.requestOf(hosting) });

            return { output: { command: 'analyze', rules: projectAnalysis(outcome.report, outcome.result, options.baseLocale) }, outcome: null };
        });
    }

    /**
     * @private
     */
    private transform(project: ProjectRecord, options: ITransformOptions, hosting: IRunHosting): Promise<RunResult> {
        return this.settle(project, 'transform', hosting, async () => {
            const outcome = await this._init.runner.run(new TransformUseCase(), { cwd: project.folder, options, writeMode: hosting.writeMode ?? this.writeModeOf(hosting.dryRun), ...this.requestOf(hosting) });
            const written = this.finishWrite(outcome, project);

            return {
                output: { command: 'transform', rows: outcome.result.map((result) => this.transformRow(result, project.folder, outcome.changeSet)) },
                outcome: written
            };
        });
    }

    /**
     * @private
     */
    private sort(project: ProjectRecord, options: ISortOptions, hosting: IRunHosting): Promise<RunResult> {
        return this.settle(project, 'sort', hosting, async () => {
            const outcome = await this._init.runner.run(new SortUseCase(), { cwd: project.folder, options, writeMode: hosting.writeMode ?? this.writeModeOf(hosting.dryRun), ...this.requestOf(hosting) });
            const written = this.finishWrite(outcome, project);

            return {
                output: { command: 'sort', rows: outcome.result.map((resource) => this.outputRow(resource, project.folder, outcome.changeSet)) },
                outcome: written
            };
        });
    }

    /**
     * @private
     */
    private generate(project: ProjectRecord, input: GenerateInput, hosting: IRunHosting): Promise<RunResult> {
        return this.settle(project, 'generate', hosting, async () => {
            const { outcome, translated } = await this._init.generation().run(project, input, hosting);

            return { output: { command: 'generate', translated }, outcome: this.finishWrite(outcome, project) };
        });
    }

    /**
     * Turns the end of a run into its result, a failure or a stop included.
     *
     * @private
     */
    private async settle(project: ProjectRecord, command: RunStartRequest['command'], hosting: IRunHosting, run: () => Promise<{ output: RunOutput; outcome: WriteOutcome | null }>): Promise<RunResult> {
        try {
            const { output, outcome } = await run();

            return { runId: hosting.runId ?? '', command, projectId: project.id, state: 'succeeded', dryRun: hosting.dryRun, failure: null, outcome, output };
        } catch (error) {
            return this.failureOf(project, command, hosting, error);
        }
    }

    /**
     * @private
     */
    private failureOf(project: ProjectRecord, command: RunStartRequest['command'], hosting: IRunHosting, error: unknown): RunResult {
        return {
            runId: hosting.runId ?? '',
            command,
            projectId: project.id,
            state: error instanceof EngineError && error.code === 'run-stopped' ? 'stopped' : 'failed',
            dryRun: hosting.dryRun,
            failure: DisplayPath.scrub(error instanceof Error ? error.message : String(error), this._init.home),
            outcome: null,
            output: null
        };
    }

    /**
     * @private
     */
    private requestOf(hosting: IRunHosting): { runId?: string; signal?: AbortSignal; listener?: IRunListener; cache?: IResultCacheRequest; verbose?: boolean; collectChanges?: IRunHosting['collectChanges'] } {
        return {
            ...hosting.collectChanges ? { collectChanges: hosting.collectChanges } : {},
            ...hosting.runId ? { runId: hosting.runId } : {},
            ...hosting.signal ? { signal: hosting.signal } : {},
            ...hosting.listener ? { listener: hosting.listener } : {},
            ...hosting.cache ? { cache: hosting.cache } : {},
            ...hosting.verbose === undefined ? {} : { verbose: hosting.verbose }
        };
    }

    /**
     * With dry run on, a change set waits in Review and nothing reaches the repository.
     *
     * @private
     */
    private writeModeOf(dryRun: boolean): WriteMode {
        return dryRun ? 'review' : 'apply';
    }

    /**
     * @private
     */
    private async updateConfiguration(projectId: string, edits: Array<{ key: string; value: unknown }>, dryRun: boolean): Promise<WriteOutcome> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const seed = new Map<string, string>();

        // A project that was set up in the app has its choices in the profile, and the new file must not lose them.
        if (project.setup && !configuration.configFile && !configuration.nxTarget) {
            seed.set(resolve(configuration.cwd, CONFIG_FILE_NAME), `${JSON.stringify(toConfigurationFile(project.folder, project.setup), null, 2)}\n`);
        }

        const outcome = await this._init.runner.run(new ConfigUpdateUseCase(configuration, seed), { cwd: project.folder, options: { edits }, writeMode: this.writeModeOf(dryRun) });

        return this.finishWrite(outcome, project);
    }

    /**
     * The checkboxes of the rules edit the one value of a rule: its severity. A rule that is checked again gets what it is worth by
     * default, and a list of rules from older configuration takes it back in.
     *
     * @private
     */
    private addRuleEdits(configuration: IResolvedConfiguration, checked: ReadonlyArray<string>, set: (key: string, value: unknown) => void): void {
        const { options } = configuration;
        const listed = options.actions?.analyze?.rules ?? [];
        const missing = new Array<string>();

        for (const rule of new ResourceAnalyzer(QUIET_LOGGER).ruleNames) {
            const current = RuleSettings.severityOf(options, rule);
            const isChecked = checked.includes(rule);

            if (!isChecked && current !== 'off') {
                set(`actions.analyze.severities.${rule}`, 'off');
            }

            if (isChecked && current === 'off') {
                set(`actions.analyze.severities.${rule}`, BUILT_IN_RULE_SEVERITIES[rule]);

                if (listed.length > 0 && !listed.includes(rule)) {
                    missing.push(rule);
                }
            }
        }

        if (missing.length > 0) {
            set('actions.analyze.rules', [...listed, ...missing]);
        }
    }

    /**
     * @private
     */
    private addPathEdits(project: ProjectRecord, configuration: IResolvedConfiguration, changes: ProjectSettingsChanges, folders: ISettingsFolders, set: (key: string, value: unknown) => void): void {
        const removed = changes.removeResourceRoots ?? [];

        if (!folders.sourceRoot && folders.addResourceRoots.length === 0 && removed.length === 0) {
            return;
        }

        const base = configuration.projectRoot;
        const toRelative = (path: string): string => DisplayPath.relativeTo(base, path);
        const root = folders.sourceRoot ?? configuration.root;
        const relativeRoot = root ? toRelative(root) : '';
        const roots = [
            ...configuration.resourceRoots.filter((path) => path.length > 0).filter((_path, index) => !removed.includes(index)),
            ...folders.addResourceRoots
        ];

        if (folders.sourceRoot) {
            set('actions.detect.root', relativeRoot);
        }

        // A resource root in a file is relative to `root`, so a new root moves them as well.
        set('actions.detect.resourceRoot', roots.map((path) => PathResolver.toOption(base, relativeRoot, resolve(project.folder, path))));
    }

    /**
     * Puts what the runs of one repository want to write into one change set. Two projects that share a file propose the same thing
     * from the same catalog, so the first one speaks for both.
     *
     * @private
     */
    private mergeChanges(repository: string, entries: ReadonlyArray<IBatchChange>, wasStopped: boolean): ChangeSet {
        const files = new Map<string, ChangeSet['files'][number]>();
        const [first] = entries;

        for (const { changeSet } of entries) {
            for (const file of changeSet.files) {
                if (!files.has(file.path)) {
                    files.set(file.path, { ...file, displayPath: DisplayPath.relativeTo(repository, file.path) });
                }
            }
        }

        return {
            ...first.changeSet,
            cwd: repository,
            source: { ...first.changeSet.source, detail: entries.length === 1 ? first.changeSet.source.detail : `${entries.length} projects` },
            files: Array.from(files.values()),
            findings: entries.flatMap(({ changeSet }) => changeSet.findings),
            partial: wasStopped || entries.some(({ changeSet }) => changeSet.partial)
        };
    }

    /**
     * Tells the record of a run and its project what became of the files of the run.
     *
     * @private
     */
    private noteBatchWrite(entry: IBatchChange, written: ChangeSet): WriteOutcome {
        const { project } = this._init.workspaces.requireProject(entry.projectId);
        const record = this._init.runs.get(entry.runId);
        const files = entry.changeSet.files.map(({ path, displayPath, action }) => ({ path, displayPath, action }));

        if (record) {
            this._init.runs.write({ ...record, changeSet: { id: written.id, state: written.state, createdAt: written.createdAt, cwd: written.cwd, source: written.source, partial: written.partial, files, findingCount: written.findings.length } });
        }

        if (written.state === 'applied') {
            this._init.catalogs.invalidate(project.id);
        }

        return { state: written.state === 'applied' ? 'applied' : 'pending', changeSetId: written.id, runId: entry.runId, files: entry.changeSet.files.map((file) => file.displayPath) };
    }

    /**
     * Tells the views what became of a change, and keeps what was read about the project up to date.
     *
     * @private
     */
    private finishWrite<TResult>(outcome: IEngineOutcome<TResult>, project: ProjectRecord): WriteOutcome {
        const changeSet = outcome.changeSet;

        // A real dry run stored nothing and wrote nothing, and its files say what it would have written. A batch says later.
        if (changeSet?.state === 'proposed') {
            return { state: 'unchanged', changeSetId: null, runId: outcome.report.runId, files: changeSet.files.map((file) => file.displayPath) };
        }

        if (changeSet?.state === 'pending') {
            this._init.review.removeRepeats(changeSet);
        }

        if (changeSet?.state === 'applied') {
            this._init.catalogs.invalidate(project.id);
        }

        return {
            state: !changeSet ? 'unchanged' : changeSet.state === 'applied' ? 'applied' : 'pending',
            changeSetId: changeSet?.id ?? null,
            runId: outcome.report.runId,
            files: changeSet?.files.map((file) => file.displayPath) ?? []
        };
    }

    /**
     * @private
     */
    private transformRow(result: IResourceTransformerResult, folder: string, changeSet: ChangeSet | null): OutputRow {
        return this.outputRow(result.transformedResource, folder, changeSet);
    }

    /**
     * @private
     */
    private outputRow(resource: IResourceInfo, folder: string, changeSet: ChangeSet | null): OutputRow {
        const path = resolve(resource.path);
        const preview = resource.toString();
        const isChanged = changeSet?.files.some((file) => file.path === path) ?? false;
        const stateOf = (): OutputRow['state'] => {
            if (!isChanged) {
                return 'unchanged';
            }

            return changeSet?.state === 'applied' ? 'written' : 'would-be-written';
        };

        return {
            file: DisplayPath.relativeTo(folder, path),
            keys: resource.keys().length,
            state: stateOf(),
            preview: preview.slice(0, MAX_PREVIEW_LENGTH),
            previewTruncated: preview.length > MAX_PREVIEW_LENGTH
        };
    }

    /**
     * @private
     */
    private rememberScan(scan: IDetectScan): void {
        this._scans.set(scan.scanId, scan);

        for (const oldest of this._scans.keys()) {
            if (this._scans.size <= MAX_SCANS) {
                break;
            }

            this._scans.delete(oldest);
        }
    }

    /**
     * @private
     */
    private lastAnalysis(project: ProjectRecord): ReturnType<typeof describeAnalysis> | null {
        const run = this._init.runs.list().find((candidate) => candidate.command === 'analyze' && candidate.state === 'succeeded' && RunProjection.belongsTo(candidate, project.folder));

        return run ? describeAnalysis(run) : null;
    }

    // #endregion

}

/**
 * Turns the choices of Project setup, whose paths are relative to the project, into the shape of a configuration file,
 * where `resourceRoot` is relative to `root`. Empty values stay out, so the file says only what was chosen.
 *
 * @public
 * @param folder The folder of the project.
 * @param setup The choices.
 * @returns The settings of the file.
 */
export function toConfigurationFile(folder: string, setup: ProjectOptions): ProjectOptions {
    const detect = setup.actions?.detect;
    const root = detect?.root ?? '';
    const resourceRoot = detect?.resourceRoot;
    const entries = resourceRoot === undefined ? [] : Array.isArray(resourceRoot) ? resourceRoot : [resourceRoot];
    const copy = ProjectOptionsSchema.parse(structuredClone(setup));
    const target = copy.actions?.detect;

    if (target) {
        if (!target.root) {
            delete target.root;
        }

        if (!target.preset) {
            delete target.preset;
        }

        if (entries.length > 0) {
            target.resourceRoot = entries.map((entry) => PathResolver.toOption(folder, root, resolve(folder, entry)));
        }
    }

    return copy;
}

/**
 * Projects the results of an analysis for a view: per rule the locales it failed in and the rows of its table.
 *
 * @internal
 * @param report The report of the run.
 * @param results The results, in the order of the report.
 * @param baseLocale The base locale.
 * @returns One result per rule.
 */
export function projectAnalysis(report: CommandReport, results: ReadonlyArray<IAnalyzerRuleResult>, baseLocale: string): Array<AnalyzeRuleResult> {
    const rows = (report.data as { results: Array<{ rule: string; locale: string; success: boolean; message: string; details: unknown }> }).results;
    const byRule = new Map<string, Array<{ locale: string; success: boolean; message: string; details: Array<Record<string, unknown>>; resource: IResourceInfo; result: IAnalyzerRuleResult }>>();

    rows.forEach((row, index) => {
        byRule.set(row.rule, [...byRule.get(row.rule) ?? [], { locale: row.locale, success: row.success, message: row.message, details: (Array.isArray(row.details) ? row.details : []) as Array<Record<string, unknown>>, resource: results[index].resource, result: results[index] }]);
    });

    return Array.from(byRule.entries()).map(([id, entries]) => {
        const failing = entries.filter((entry) => !entry.success);
        const shown = failing[0] ?? entries[0];
        const presentation = shown.result.presentation;
        const all = failing.length > 0 ? rowsOfRule(id, failing, baseLocale) : entries.map((entry) => ({ a: entry.locale, b: 'Pass', key: null, value: null, keys: [], locale: entry.locale }));

        return {
            id,
            passed: failing.length === 0,
            message: shown.message.slice(0, MAX_MESSAGE_LENGTH),
            locales: failing.map((entry) => ({ locale: entry.locale, count: foundItemsOf(entry.details).length || null })),
            total: all.length,
            rows: all.slice(0, MAX_RULE_ROWS),
            severity: shown.result.severity ?? 'error',
            pack: presentation
                ? { name: presentation.pack, title: fillRuleMessage(presentation.title, { count: all.length, locale: shown.locale, baseLocale }), column: presentation.column }
                : null
        };
    });
}

/**
 * The lists in which the built-in rules report what they found.
 */
const FOUND_LISTS = ['duplicates', 'keys', 'missingKeys', 'multipleUsageKeys', 'unusedKeys', 'untranslatedKeys'];

/**
 * @private
 */
function rowsOfRule(id: string, failing: ReadonlyArray<{ locale: string; details: Array<Record<string, unknown>>; resource: IResourceInfo; result: IAnalyzerRuleResult }>, baseLocale: string): Array<AnalyzeRow> {
    if (failing[0].result.presentation) {
        return declarativeRows(failing);
    }

    if (id === 'duplicate-values') {
        return duplicateValueRows(failing, baseLocale);
    }

    if (id === 'missing-translations') {
        return identicalValueRows(failing);
    }

    const locales = new Map<string, Array<string>>();

    for (const { locale, details } of failing) {
        for (const name of FOUND_LISTS) {
            for (const entry of details) {
                for (const key of Array.isArray(entry[name]) ? entry[name] as Array<string> : []) {
                    locales.set(key, Array.from(new Set([...locales.get(key) ?? [], locale])));
                }
            }
        }
    }

    return Array.from(locales.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, codes]) => ({ a: key, b: codes.join(', '), key, value: null, keys: [key], locale: codes[0] ?? null }));
}

/**
 * Lists what a rule of a pack found: per key what it says, with the locale when several locales failed.
 *
 * @private
 */
function declarativeRows(failing: ReadonlyArray<{ locale: string; details: Array<Record<string, unknown>> }>): Array<AnalyzeRow> {
    const named = failing.length > 1;

    return failing.flatMap(({ locale, details }) => (details as unknown as Array<IDeclarativeRuleData>).flatMap((entry) => [
        ...entry.stopped ? [{ a: locale, b: entry.stopped, key: null, value: null, keys: [], locale }] : [],
        ...entry.rows.map((row) => ({ a: row.key, b: named ? `${locale}: ${row.detail}` : row.detail, key: row.key, value: null, keys: [row.key], locale }))
    ]));
}

/**
 * Lists the texts that several keys carry, in the base locale when it has any.
 *
 * @private
 */
function duplicateValueRows(failing: ReadonlyArray<{ locale: string; resource: IResourceInfo }>, baseLocale: string): Array<AnalyzeRow> {
    const chosen = failing.find((entry) => entry.locale === baseLocale) ?? failing[0];
    const byValue = new Map<string, Array<string>>();

    for (const [key, value] of chosen.resource.entries()) {
        byValue.set(value, [...byValue.get(value) ?? [], key]);
    }

    return Array.from(byValue.entries())
        .filter(([, keys]) => keys.length > 1)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, keys]) => ({ a: value, b: keys.join(', '), key: null, value, keys, locale: chosen.locale }));
}

/**
 * Lists the keys whose value equals the base locale, once each.
 *
 * @private
 */
function identicalValueRows(failing: ReadonlyArray<{ locale: string; details: Array<Record<string, unknown>>; resource: IResourceInfo }>): Array<AnalyzeRow> {
    const rows = new Map<string, AnalyzeRow>();

    for (const { locale, details, resource } of failing) {
        const values = new Map(resource.entries());

        for (const entry of details) {
            for (const key of entry.untranslatedKeys as Array<string>) {
                if (!rows.has(key)) {
                    const value = values.get(key) ?? '';

                    rows.set(key, { a: key, b: value, key, value, keys: [key], locale });
                }
            }
        }
    }

    return Array.from(rows.values()).sort((a, b) => a.a.localeCompare(b.a));
}
