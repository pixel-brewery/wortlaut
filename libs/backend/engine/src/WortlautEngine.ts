// #region Imports

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IFileSystem, ILogger } from '@pixel-brewery/utilities';
import type { IAiProviderHost, IAiProviderInfo, IResourceGeneratorResult, IResourceGeneratorStrategy } from '@pixel-brewery/wortlaut-ai';
import type { ChangeSet, ChangeSetSummary, RunProgressEvent, Surface } from '@pixel-brewery/wortlaut-contracts';
import type { IAnalyzerRuleResult, ILocalizationProcessorResult, IResourceInfo, IResourceTransformerResult } from '@pixel-brewery/wortlaut-core';
import { AssistantCommands } from './assistants/AssistantCommands.js';
import { CatalogService } from './catalogs/CatalogService.js';
import { ChangeSetApplier } from './changes/ChangeSetApplier.js';
import { ChangeSetJournal } from './changes/ChangeSetJournal.js';
import { ChangeSetRecovery, type IRecoveredChangeSet } from './changes/ChangeSetRecovery.js';
import { ReviewList } from './changes/ReviewList.js';
import { ReviewService } from './changes/ReviewService.js';
import { ProjectCommands } from './commands/ProjectCommands.js';
import { ConfigurationResolver, type IConfigurationRequest, type IResolvedConfiguration } from './configuration/ConfigurationResolver.js';
import { GenerateService } from './generate/GenerateService.js';
import type { IAnalyzeOptions, IDetectOptions, IGenerateOptions, IInitOptions, ISortOptions, ITransformOptions } from './interfaces/ICommandOptions.js';
import { createSortableId } from './io/AtomicFile.js';
import { LiteralFileSystem } from './io/LiteralFileSystem.js';
import { AiPreferences } from './profile/AiPreferences.js';
import { resolveProfileRoot } from './profile/Profile.js';
import { ProjectInspector } from './projects/ProjectInspector.js';
import { ProjectService } from './projects/ProjectService.js';
import { HttpPackFetcher, type IPackFetcher } from './rulepacks/PackFetcher.js';
import { RulePackService } from './rulepacks/RulePackService.js';
import { CommandRunner, type IEngineOutcome, type IEngineRequest } from './runs/CommandRunner.js';
import { RunStore } from './runs/RunStore.js';
import { SearchService } from './search/SearchService.js';
import { TestLab } from './testlab/TestLab.js';
import { TranslationLab } from './testlab/TranslationLab.js';
import { AiStatusUseCase } from './usecases/AiStatusUseCase.js';
import { AnalyzeUseCase } from './usecases/AnalyzeUseCase.js';
import { ApplyChangeSetUseCase, DiscardChangeSetUseCase } from './usecases/ChangeSetUseCases.js';
import { ConfigSetUseCase, type IConfigSetOptions } from './usecases/ConfigSetUseCase.js';
import { CatalogEditUseCase, type ICatalogEditOptions } from './usecases/CatalogEditUseCase.js';
import { DetectApplyUseCase, type IDetectApplyOptions } from './usecases/DetectApplyUseCase.js';
import { DetectUseCase } from './usecases/DetectUseCase.js';
import { GenerateUseCase } from './usecases/GenerateUseCase.js';
import { InfoUseCase, type IInfoResult } from './usecases/InfoUseCase.js';
import { InitUseCase } from './usecases/InitUseCase.js';
import { SortUseCase } from './usecases/SortUseCase.js';
import { TransformUseCase } from './usecases/TransformUseCase.js';
import { WorkspaceService } from './workspaces/WorkspaceService.js';
import { WorkspaceStore } from './workspaces/WorkspaceStore.js';
import { WorkspaceTransfer } from './workspaces/WorkspaceTransfer.js';

// #endregion

/**
 * What an engine is composed of. Every surface builds its own: the engine has no global state and no console.
 *
 * @public
 */
export interface IEngineInit {

    /**
     * The surface that runs the engine, recorded on every run.
     */
    surface: Surface;

    /**
     * The logger of the surface.
     */
    logger: ILogger;

    /**
     * The file system for reading catalogs and sources.
     */
    fileSystem?: IFileSystem;

    /**
     * The directory of the user's profile, for surfaces that know it. By default it follows the platform.
     */
    profileRoot?: string;

    /**
     * The environment, for tokens, provider keys and the location of the profile.
     */
    env?: NodeJS.ProcessEnv;

    /**
     * The user's home directory, which display paths abbreviate.
     */
    home?: string;

    /**
     * Additional AI strategies by name, next to the built-in ones.
     */
    strategies?: ReadonlyMap<string, IResourceGeneratorStrategy>;

    /**
     * The AI providers of the surface. Only a surface composes them: the engine receives them.
     */
    ai?: IAiProviderHost;

    /**
     * The first wait before a chunk is asked again.
     */
    retryDelayMs?: number;

    /**
     * Reaches the sources of rule packs. By default it fetches over HTTPS.
     */
    packFetcher?: IPackFetcher;

    /**
     * Refuses every write and every proposal outside of the folders the user chose for a workspace, for a surface that takes
     * instructions from outside.
     */
    restrictToKnownRoots?: boolean;

    /**
     * The clock.
     */
    now?: () => Date;

    /**
     * What identifies this build of the tool. It is part of the key of every cached result, so a run without it reuses nothing.
     */
    tool?: string;

    /**
     * Receives progress while a command runs.
     */
    onProgress?: (event: RunProgressEvent) => void;
}

/**
 * The one engine behind every surface. A surface parses its input, calls a use case and presents the outcome.
 *
 * @public
 */
export class WortlautEngine {

    // #region Fields

    private readonly _env: NodeJS.ProcessEnv;
    private readonly _strategies: ReadonlyMap<string, IResourceGeneratorStrategy>;
    private readonly _runs: RunStore;
    private readonly _reviewList: ReviewList;
    private readonly _runner: CommandRunner;
    private readonly _inspector: ProjectInspector;
    private readonly _workspaces: WorkspaceService;
    private readonly _projects: ProjectService;
    private readonly _catalogs: CatalogService;
    private readonly _review: ReviewService;
    private readonly _testLab: TestLab;
    private readonly _commands: ProjectCommands;
    private readonly _generation: GenerateService;
    private readonly _translationLab: TranslationLab;
    private readonly _preferences: AiPreferences;
    private readonly _ai: IAiProviderHost | null;
    private readonly _rulePacks: RulePackService;
    private readonly _assistants: AssistantCommands;
    private readonly _transfer: WorkspaceTransfer;
    private readonly _search: SearchService;
    private readonly _recovered: ReadonlyArray<IRecoveredChangeSet>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `WortlautEngine` class.
     *
     * @public
     * @param init What the engine is composed of.
     */
    public constructor(init: IEngineInit) {
        this._env = init.env ?? process.env;
        this._strategies = init.strategies ?? new Map();

        const home = init.home ?? homedir();
        const profile = init.profileRoot ?? resolveProfileRoot(this._env, process.platform, home);
        const now = init.now ?? ((): Date => new Date());
        const literalFileSystem = new LiteralFileSystem();
        const resolver = new ConfigurationResolver(this._env);
        const journal = new ChangeSetJournal(join(profile, 'journal'));

        this._runs = new RunStore(join(profile, 'runs'));
        this._reviewList = new ReviewList(join(profile, 'changes'));
        this._runner = new CommandRunner({
            surface: init.surface,
            logger: init.logger,
            fileSystem: init.fileSystem ?? literalFileSystem,
            runs: this._runs,
            reviewList: this._reviewList,
            applier: new ChangeSetApplier({ journal }),
            tool: init.tool,
            now,
            onProgress: init.onProgress
        });
        this._inspector = new ProjectInspector(resolver, literalFileSystem, home);
        this._workspaces = new WorkspaceService(new WorkspaceStore(join(profile, 'workspaces.json')), this._inspector, home, now);
        this._projects = new ProjectService({ workspaces: this._workspaces, resolver, runs: this._runs, fileSystem: literalFileSystem, home, env: this._env });
        this._catalogs = new CatalogService({ workspaces: this._workspaces, projects: this._projects, fileSystem: literalFileSystem });
        this._review = new ReviewService(this._reviewList, this._workspaces);
        this._testLab = new TestLab();
        this._ai = init.ai ?? null;
        this._preferences = new AiPreferences(join(profile, 'ai.json'));
        this._generation = new GenerateService({
            surface: init.surface,
            runner: this._runner,
            reviewList: this._reviewList,
            workspaces: this._workspaces,
            projects: this._projects,
            catalogs: this._catalogs,
            preferences: this._preferences,
            ai: this._ai,
            fileSystem: literalFileSystem,
            home,
            now,
            retryDelayMs: init.retryDelayMs
        });
        this._translationLab = new TranslationLab({ ai: this._ai, now: () => now().getTime(), createId: () => createSortableId(now()) });
        this._rulePacks = new RulePackService({
            runner: this._runner,
            runs: this._runs,
            workspaces: this._workspaces,
            projects: this._projects,
            review: this._review,
            fetcher: init.packFetcher ?? new HttpPackFetcher({ env: this._env }),
            home,
            now
        });
        this._commands = new ProjectCommands({ runner: this._runner, runs: this._runs, workspaces: this._workspaces, projects: this._projects, catalogs: this._catalogs, review: this._review, testLab: this._testLab, generation: () => this._generation, home });
        this._assistants = new AssistantCommands({ runner: this._runner, runs: this._runs, reviewList: this._reviewList, review: this._review, workspaces: this._workspaces, projects: this._projects, catalogs: this._catalogs, commands: this._commands, generation: this._generation, testLab: this._testLab, home, now });

        this._transfer = new WorkspaceTransfer({ workspaces: this._workspaces, rulePacks: this._rulePacks, now });
        this._search = new SearchService({ workspaces: this._workspaces, projects: this._projects, catalogs: this._catalogs, now });

        if (init.restrictToKnownRoots) {
            this._runner.guardPaths((path) => this._workspaces.requireInsideKnownRoots(path));
        }

        this._recovered = this.recoverInterruptedWrites(journal, init.logger);
    }

    // #endregion

    // #region Properties

    /**
     * Gets the run store.
     *
     * @public
     * @readonly
     */
    public get runs(): RunStore {
        return this._runs;
    }

    /**
     * Gets the inspector that finds out what a folder holds.
     *
     * @public
     * @readonly
     */
    public get inspector(): ProjectInspector {
        return this._inspector;
    }

    /**
     * Gets the workspaces of the user's profile.
     *
     * @public
     * @readonly
     */
    public get workspaces(): WorkspaceService {
        return this._workspaces;
    }

    /**
     * Gets the reads of a registered project.
     *
     * @public
     * @readonly
     */
    public get projects(): ProjectService {
        return this._projects;
    }

    /**
     * Gets the reads behind Translations.
     *
     * @public
     * @readonly
     */
    public get catalogs(): CatalogService {
        return this._catalogs;
    }

    /**
     * Gets the review list as Review shows it.
     *
     * @public
     * @readonly
     */
    public get review(): ReviewService {
        return this._review;
    }

    /**
     * Gets the test lab.
     *
     * @public
     * @readonly
     */
    public get testLab(): TestLab {
        return this._testLab;
    }

    /**
     * Gets the commands of a registered project.
     *
     * @public
     * @readonly
     */
    public get commands(): ProjectCommands {
        return this._commands;
    }

    /**
     * Gets Generate of the app: setups, runs with their review, and AI proposals.
     *
     * @public
     * @readonly
     */
    public get generation(): GenerateService {
        return this._generation;
    }

    /**
     * Gets the comparison of two setups in the test lab.
     *
     * @public
     * @readonly
     */
    public get translationLab(): TranslationLab {
        return this._translationLab;
    }

    /**
     * Gets what the profile keeps about AI.
     *
     * @public
     * @readonly
     */
    public get aiPreferences(): AiPreferences {
        return this._preferences;
    }

    /**
     * Gets the rule packs: their checks, pins, updates and settings.
     *
     * @public
     * @readonly
     */
    public get rulePacks(): RulePackService {
        return this._rulePacks;
    }

    /**
     * Gets what an assistant can ask of the engine.
     *
     * @public
     * @readonly
     */
    public get assistants(): AssistantCommands {
        return this._assistants;
    }

    /**
     * Gets what moves a workspace between computers.
     *
     * @public
     * @readonly
     */
    public get transfer(): WorkspaceTransfer {
        return this._transfer;
    }

    /**
     * Gets the search of the title bar.
     *
     * @public
     * @readonly
     */
    public get search(): SearchService {
        return this._search;
    }

    /**
     * Gets what this start found of writes that a dead process left behind, and what became of them.
     *
     * @public
     * @readonly
     */
    public get recovered(): ReadonlyArray<IRecoveredChangeSet> {
        return this._recovered;
    }

    /**
     * Gets the AI providers of the surface.
     *
     * @public
     * @readonly
     */
    public get ai(): IAiProviderHost | null {
        return this._ai;
    }

    // #endregion

    // #region Methods

    /**
     * Asks every provider for its true state, and records it as a run. It starts no login and installs nothing.
     *
     * @public
     * @param cwd The working directory.
     * @param host The providers.
     * @returns The providers.
     */
    public aiStatus(cwd: string, host: IAiProviderHost): Promise<IEngineOutcome<Array<IAiProviderInfo>>> {
        return this._runner.run(new AiStatusUseCase(host), { cwd, options: {} });
    }

    /**
     * Resolves the configuration of a project with a source for every value.
     *
     * @public
     * @param request What to resolve it for.
     * @returns The resolved configuration.
     */
    public resolveConfiguration(request: IConfigurationRequest): IResolvedConfiguration {
        return new ConfigurationResolver(this._env).resolve(request);
    }

    /**
     * Finds the strings of the sources.
     *
     * @public
     */
    public detect(request: IEngineRequest<IDetectOptions>): Promise<IEngineOutcome<Array<ILocalizationProcessorResult>>> {
        return this._runner.run(new DetectUseCase(), request);
    }

    /**
     * Scans the sources and replaces every hard-coded string that can be replaced with its key, adding new keys to the
     * catalog of the base locale, as one change set.
     *
     * @public
     */
    public detectApply(request: IEngineRequest<IDetectApplyOptions>): Promise<IEngineOutcome<Array<string>>> {
        return this._runner.run(new DetectApplyUseCase(null), request);
    }

    /**
     * Edits the catalogs of a project, as a change set.
     *
     * @public
     */
    public editCatalog(request: IEngineRequest<ICatalogEditOptions>): Promise<IEngineOutcome<Array<string>>> {
        return this._runner.run(new CatalogEditUseCase(), request);
    }

    /**
     * Runs the analyzer rules on the catalogs.
     *
     * @public
     */
    public analyze(request: IEngineRequest<IAnalyzeOptions>): Promise<IEngineOutcome<Array<IAnalyzerRuleResult>>> {
        return this._runner.run(new AnalyzeUseCase(), request);
    }

    /**
     * Translates a catalog with AI.
     *
     * @public
     */
    public generate(request: IEngineRequest<IGenerateOptions>): Promise<IEngineOutcome<Array<IResourceGeneratorResult>>> {
        return this._runner.run(new GenerateUseCase(this._env, this._strategies), request);
    }

    /**
     * Converts the catalogs into other formats.
     *
     * @public
     */
    public transform(request: IEngineRequest<ITransformOptions>): Promise<IEngineOutcome<Array<IResourceTransformerResult>>> {
        return this._runner.run(new TransformUseCase(), request);
    }

    /**
     * Sorts the keys of the catalogs.
     *
     * @public
     */
    public sort(request: IEngineRequest<ISortOptions>): Promise<IEngineOutcome<Array<IResourceInfo>>> {
        return this._runner.run(new SortUseCase(), request);
    }

    /**
     * Reports the machine.
     *
     * @public
     */
    public info(cwd: string): Promise<IEngineOutcome<IInfoResult>> {
        return this._runner.run(new InfoUseCase(), { cwd, options: {} });
    }

    /**
     * Creates the configuration file of a project, through a change set.
     *
     * @public
     */
    public init(request: IEngineRequest<IInitOptions>): Promise<IEngineOutcome<string>> {
        return this._runner.run(new InitUseCase(), request);
    }

    /**
     * Changes one setting in the file it comes from, through a change set.
     *
     * @public
     */
    public setConfiguration(configuration: IResolvedConfiguration, request: IEngineRequest<IConfigSetOptions>): Promise<IEngineOutcome<string>> {
        return this._runner.run(new ConfigSetUseCase(configuration), request);
    }

    /**
     * Returns the pending change sets, oldest first.
     *
     * @public
     */
    public listChangeSets(): Array<ChangeSetSummary> {
        return this._reviewList.list().map((changeSet) => CommandRunner.summarize(changeSet));
    }

    /**
     * Returns a pending change set with its contents.
     *
     * @public
     * @throws EngineError when the review list does not hold it.
     */
    public getChangeSet(id: string): ChangeSet {
        return this._reviewList.get(id);
    }

    /**
     * Applies a pending change set: every file is checked again, and all of them are written or none.
     *
     * @public
     * @throws EngineError naming the files that changed in the meantime.
     */
    public applyChangeSet(id: string, cwd: string): Promise<IEngineOutcome<ChangeSet>> {
        return this._runner.run(new ApplyChangeSetUseCase(this._reviewList, this._runner.applier), { cwd, options: { id } });
    }

    /**
     * Removes a pending change set without writing anything.
     *
     * @public
     * @throws EngineError when the review list does not hold it.
     */
    public discardChangeSet(id: string, cwd: string): Promise<IEngineOutcome<ChangeSet>> {
        return this._runner.run(new DiscardChangeSetUseCase(this._reviewList), { cwd, options: { id } });
    }

    /**
     * Sorts out the writes a dead process left behind, before this engine does anything else. A change set that was finished leaves
     * the review list, and one that was restored stays in it, ready to apply again.
     *
     * @private
     */
    private recoverInterruptedWrites(journal: ChangeSetJournal, logger: ILogger): ReadonlyArray<IRecoveredChangeSet> {
        const recovered = new ChangeSetRecovery(journal).recover();

        for (const entry of recovered) {
            logger.warn(entry.message);

            if (entry.outcome === 'finished') {
                this._reviewList.remove(entry.changeSetId);
            }

            this._runner.recordRecovery(entry);
        }

        return recovered;
    }

    // #endregion

}
