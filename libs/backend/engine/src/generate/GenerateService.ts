// #region Imports


import { resolve } from 'node:path';
import { buildTranslationPrompt, estimateTokensFor, isLocalAssistant, nameKeys, promptText, ResourceGenerator, suggestPatterns, suggestValue, type IAiProviderHost, type IAiProviderInfo, type IPreparedStrategy, type ITranslationPlan } from '@pixel-brewery/wortlaut-ai';
import type { AiDefaults, AiKeyNames, AiPatternProposals, AiProvider, AiValueProposal, ChangeSet, GenerateCommand, GenerateEstimate, GenerateInput, GenerateOverview, GenerateRow, GenerateRun, ProjectRecord, Surface, WriteMode } from '@pixel-brewery/wortlaut-contracts';
import { ResourceReader, ResourceTransformer, type IResourceInfo, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import type { IFileSystem } from '@pixel-brewery/utilities';
import type { CatalogService } from '../catalogs/CatalogService.js';
import { ChangeSetBuilder } from '../changes/ChangeSetBuilder.js';
import type { ReviewList } from '../changes/ReviewList.js';
import { CommandOptions } from '../configuration/CommandOptions.js';
import { CONFIG_FILE_NAME, type IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import type { IGenerateOptions } from '../interfaces/ICommandOptions.js';
import { createSortableId } from '../io/AtomicFile.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { CommandPrinter } from '../printing/CommandPrinter.js';
import type { AiPreferences } from '../profile/AiPreferences.js';
import type { ProjectService } from '../projects/ProjectService.js';
import type { CommandRunner, IEngineOutcome, IRunListener, IUseCaseContext } from '../runs/CommandRunner.js';
import { SecretScrubber } from '../security/SecretScrubber.js';
import { GenerateWriteUseCase } from '../usecases/GenerateWriteUseCase.js';
import { TranslationRunUseCase, type ITranslationRunOptions } from '../usecases/TranslationRunUseCase.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import { createCommentReader } from './CatalogCommentReader.js';
import { composeTargets } from './composeTargets.js';
import { TranslationSession, type ISessionPlan } from './TranslationSession.js';

// #endregion

/**
 * The most runs whose review stays around.
 */
const MAX_SESSIONS = 16;

/**
 * How long after an edit the pending change set follows.
 */
const PENDING_DELAY_MS = 800;

/**
 * What the service is composed of.
 *
 * @internal
 */
export interface IGenerateServiceInit {
    surface: Surface;
    runner: CommandRunner;
    reviewList: ReviewList;
    workspaces: WorkspaceService;
    projects: ProjectService;
    catalogs: CatalogService;
    preferences: AiPreferences;
    ai: IAiProviderHost | null;
    fileSystem: IFileSystem;
    home: string;
    now: () => Date;

    /**
     * The first wait before a chunk is asked again.
     */
    retryDelayMs?: number;
}

/**
 * What a hosted run gets from its host.
 *
 * @internal
 */
export interface IGenerateHosting {
    runId?: string;
    signal?: AbortSignal;
    listener?: IRunListener;
    dryRun: boolean;
    verbose?: boolean;
    collectChanges?: (changeSet: ChangeSet, writeMode: WriteMode) => void;
}

/**
 * Generate of the app: what a setup would take, the runs with their review, and the AI proposals of other screens. Every path
 * ends in `libs/backend/ai`, and every write in a change set.
 *
 * @public
 */
export class GenerateService {

    // #region Fields

    private readonly _init: IGenerateServiceInit;
    private readonly _sessions: Map<string, TranslationSession>;
    private readonly _contexts: Map<string, IUseCaseContext>;
    private readonly _latest: Map<string, string>;
    private readonly _pendingTimers: Map<string, ReturnType<typeof setTimeout>>;
    private readonly _listeners: Set<(runId: string) => void>;
    private _guardPath: (path: string) => void;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `GenerateService` class.
     *
     * @param init What the service is composed of.
     */
    public constructor(init: IGenerateServiceInit) {
        this._init = init;
        this._sessions = new Map();
        this._contexts = new Map();
        this._latest = new Map();
        this._pendingTimers = new Map();
        this._listeners = new Set();
        this._guardPath = () => undefined;
    }

    // #endregion

    // #region Methods

    /**
     * Listens to what happens to the runs.
     *
     * @public
     * @param listener Called with the run that changed.
     * @returns What ends the subscription.
     */
    public subscribe(listener: (runId: string) => void): () => void {
        this._listeners.add(listener);

        return () => this._listeners.delete(listener);
    }

    /**
     * Sets what refuses a file a run wants to write, for a surface that knows which folders the user chose.
     *
     * @public
     * @param guard Throws for a file that may not be written.
     */
    public guardPaths(guard: (path: string) => void): void {
        this._guardPath = guard;
    }

    /**
     * Returns the providers with their true state.
     *
     * @public
     * @returns The providers.
     */
    public async providers(): Promise<Array<AiProvider>> {
        return (await this.requireAi().list()) as Array<AiProvider>;
    }

    /**
     * Returns what the title bar says about the active provider: the default one with its state, or else the first that is ready.
     *
     * @public
     * @returns The text, or `null` when no provider is set up.
     */
    public async activeProviderLabel(): Promise<string | null> {
        if (!this._init.ai) {
            return null;
        }

        const providers = await this._init.ai.list();
        const chosen = providers.find((provider) => provider.id === this._init.preferences.defaultProvider);
        const active = chosen ?? providers.find((provider) => provider.state === 'ready');

        if (!active) {
            return null;
        }

        return active.state === 'ready' ? `${active.name} · ${active.kind === 'local' ? 'local' : 'API key'}` : `${active.name} · not set up`;
    }

    /**
     * Returns the starting values of a run.
     *
     * @public
     * @param projectId The project.
     * @returns The values.
     */
    public defaults(projectId: string): AiDefaults {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const generate = configuration.options.actions?.generate;
        const instructions = generate?.instructions ?? '';
        const provider = this._init.preferences.defaultProvider;

        return {
            defaultProvider: isProviderId(provider) ? provider : null,
            model: generate?.model ?? '',
            temperature: generate?.temperature ?? 0.7,
            chunkSize: generate?.chunkSize ?? 10,
            limit: generate?.limit ?? null,
            instructions: Array.isArray(instructions) ? instructions.join('\n') : instructions,
            localeInstructions: generate?.localeInstructions ?? {},
            safety: {
                reviewBeforeWriting: generate?.reviewBeforeWriting ?? true,
                protectPlaceholders: generate?.protectPlaceholders ?? true,
                keepPartialResults: generate?.keepPartialResults ?? true,
                keepRawOutput: generate?.keepRawOutput ?? false
            },
            locales: this._init.catalogs.translationTargets(projectId).map((target) => target.locale),
            sourceFile: configuration.configFile ? DisplayPath.relativeTo(project.folder, configuration.configFile) : CONFIG_FILE_NAME
        };
    }

    /**
     * Returns what the set up of Generate starts from.
     *
     * @public
     * @param projectId The project.
     * @returns The overview.
     */
    public overview(projectId: string): GenerateOverview {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configured = this._init.projects.resolve(project).options.actions?.generate?.locales ?? [];
        const catalog = this._init.catalogs.translationOverview(projectId);
        const session = Array.from(this._sessions.values()).reverse()
            .find((candidate) => candidate.projectId === projectId && !candidate.hasEnded);

        return {
            baseLocale: catalog.baseLocale,
            format: catalog.format,
            keyCount: catalog.keyCount,
            namespaces: catalog.namespaces,
            targets: this._init.catalogs.translationTargets(projectId).map((target) => ({ ...target, selected: configured.includes(target.locale) })),
            defaults: this.defaults(projectId),
            activeRunId: session?.runId ?? null,
            latestRunId: this._latest.get(projectId) ?? null
        };
    }

    /**
     * Estimates what a setup would take.
     *
     * @public
     * @param projectId The project.
     * @param input The setup.
     * @returns The keys and chunks, and the tokens as an estimate.
     */
    public estimate(projectId: string, input: GenerateInput): GenerateEstimate {
        const plans = this.planAll(projectId, input);

        return plans.reduce<GenerateEstimate>((sum, entry) => {
            const models = entry.plans.flatMap(({ plan }) => plan.models);
            const chunks = entry.plans.reduce((count, { plan }) => count + plan.chunks.length, 0);
            const estimate = estimateTokensFor(input.provider, models, chunks, entry.instructions);

            return { keys: sum.keys + models.length, chunks: sum.chunks + chunks, estimatedTokens: sum.estimatedTokens + estimate.tokens, tokensAreLowerBound: estimate.isLowerBound, tokensNote: estimate.note };
        }, { keys: 0, chunks: 0, estimatedTokens: 0, ...this.emptyEstimate(input.provider) });
    }

    /**
     * Returns the real prompt of the first chunk of a setup.
     *
     * @public
     * @param projectId The project.
     * @param input The setup.
     * @returns The text.
     */
    public prompt(projectId: string, input: GenerateInput): string {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const options = CommandOptions.forGenerate(configuration);
        const locale = input.locales[0];

        if (!locale) {
            return 'Choose a target locale to see the prompt.';
        }

        const [entry] = this.planAll(projectId, { ...input, locales: [locale] });
        const first = entry?.plans[0];

        return promptText(buildTranslationPrompt({
            type: options.type,
            baseLocale: options.baseLocale,
            locale,
            models: first?.plan.chunks[0] ?? [],
            instructions: entry?.instructions ?? []
        }));
    }

    /**
     * Works out what translating one locale takes, on the path of every run, for a surface that translates on its own.
     *
     * @public
     * @param projectId The project.
     * @param locale The target locale.
     * @param scope Which keys.
     * @param namespace Only the keys below this one.
     * @returns The target files with their keys, and the instructions of the project.
     */
    public planOf(projectId: string, locale: string, scope: GenerateInput['scope'], namespace: string | null): { plans: Array<ISessionPlan>; instructions: Array<string> } {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configured = this._init.projects.resolve(project).options.actions?.generate?.instructions ?? '';
        const instructions = Array.isArray(configured) ? configured.join('\n') : configured;
        const [entry] = this.planAll(projectId, {
            locales: [locale],
            scope,
            namespace,
            keys: null,
            limit: null,
            provider: 'codex',
            model: '',
            temperature: 0,
            chunkSize: Number.MAX_SAFE_INTEGER,
            instructions,
            reviewBeforeWriting: true,
            protectPlaceholders: true
        });

        return { plans: entry.plans, instructions: entry.instructions.filter((line) => line.length > 0) };
    }

    /**
     * Prints the command line that does the same as a setup. It never holds a key.
     *
     * @public
     * @param projectId The project.
     * @param input The setup.
     * @returns The command line that runs, and how it fits on a screen.
     */
    public command(projectId: string, input: GenerateInput): GenerateCommand {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const options = CommandOptions.forGenerate(configuration);
        const isLocal = isLocalAssistant(input.provider);
        const configured = options.instructions;
        const command = CommandPrinter.printCommand('generate', {
            strategy: input.provider,
            model: isLocal ? undefined : input.model,
            baseLocale: options.baseLocale,
            locales: input.locales,
            temperature: isLocal ? undefined : input.temperature,
            chunkSize: input.chunkSize,
            limit: input.limit,
            scope: input.scope === 'all' ? undefined : input.scope,
            namespace: input.namespace,
            keys: input.keys,
            instructions: input.instructions === (Array.isArray(configured) ? configured.join('\n') : configured) ? undefined : input.instructions,
            type: options.type,
            resourceRoot: options.resourceRoot
        }, project.folder);

        return { command, shown: CommandPrinter.shorten(command) };
    }

    /**
     * Works out a setup from what a project has configured, for Run on all projects: its target locales, whatever they still miss,
     * with the provider the user set up.
     *
     * @public
     * @param projectId The project.
     * @returns The setup.
     * @throws EngineError when no provider is ready, or the project names no target locale.
     */
    public async configuredInput(projectId: string): Promise<GenerateInput> {
        const defaults = this.defaults(projectId);
        const providers = await this.providers();
        const provider = providers.find((candidate) => candidate.id === defaults.defaultProvider && candidate.state === 'ready') ?? providers.find((candidate) => candidate.state === 'ready');

        if (!provider) {
            throw new EngineError('provider-not-ready', 'No AI provider is set up. Open Settings: AI.');
        }

        if (defaults.locales.length === 0) {
            throw new EngineError('invalid-arguments', 'This project names no target locale. Add one in Generate.');
        }

        return {
            locales: defaults.locales,
            scope: 'missing',
            namespace: null,
            keys: null,
            limit: defaults.limit,
            provider: provider.id as GenerateInput['provider'],
            model: defaults.model,
            temperature: defaults.temperature,
            chunkSize: defaults.chunkSize,
            instructions: defaults.instructions,
            reviewBeforeWriting: defaults.safety.reviewBeforeWriting,
            protectPlaceholders: defaults.safety.protectPlaceholders
        };
    }

    /**
     * Runs a setup until it has ended, however long it pauses on its way. A failed, stopped or quit run writes nothing.
     *
     * @public
     * @param project The project.
     * @param input The setup.
     * @param hosting What the run gets from its host.
     * @returns The outcome and how many keys were finished.
     * @throws EngineError `run-stopped` for a stopped run, after what it finished went to the review list.
     */
    public async run(project: ProjectRecord, input: GenerateInput, hosting: IGenerateHosting): Promise<{ outcome: IEngineOutcome<TranslationSession>; translated: number }> {
        const runId = hosting.runId ?? createSortableId(this._init.now());
        const configuration = this._init.projects.resolve(project);
        const options = CommandOptions.forGenerate(configuration);
        const generate = configuration.options.actions?.generate;
        const provider = { id: input.provider, name: PROVIDER_NAMES[input.provider], kind: isLocalAssistant(input.provider) ? 'local' as const : 'key' as const };
        const scrubber = new SecretScrubber();
        const session = new TranslationSession({
            runId,
            projectId: project.id,
            input,
            dryRun: hosting.dryRun,
            provider,
            baseLocale: options.baseLocale,
            baseName: nameOfLocale(options.baseLocale),
            plans: this.planAll(project.id, input),
            identicalKeys: options.identicalKeys,
            identicalValues: options.identicalValues,
            retryDelayMs: this._init.retryDelayMs,
            keepRawOutput: generate?.keepRawOutput ?? false,
            now: this._init.now,
            scrub: (text) => DisplayPath.scrub(scrubber.scrub(text), this._init.home),
            onChange: () => this.publish(runId)
        });

        this.remember(session);

        try {
            session.targetPaths.forEach(this._guardPath);

            const prepared = await this.prepare(input);

            for (const secret of prepared.secrets) {
                scrubber.add(secret);
            }

            const outcome = await this._init.runner.run(new TranslationRunUseCase(session, prepared.strategy, prepared.secrets, generate?.keepPartialResults ?? true, (context) => this._contexts.set(runId, context)), {
                cwd: project.folder,
                options: optionsOf(input, options),
                writeMode: hosting.dryRun || input.reviewBeforeWriting ? 'review' : 'apply',
                runId,
                ...hosting.signal ? { signal: hosting.signal } : {},
                ...hosting.listener ? { listener: hosting.listener } : {},
                ...hosting.verbose === undefined ? {} : { verbose: hosting.verbose },
                ...hosting.collectChanges ? { collectChanges: hosting.collectChanges } : {}
            });

            this.noteOutcome(session, outcome.changeSet);

            return { outcome, translated: session.translatedCount() };
        } catch (error) {
            if (error instanceof EngineError && error.code === 'run-stopped') {
                session.changeSetId = error.changeSetId;
            } else if (session.status === 'running' || session.status === 'paused') {
                session.failToStart(error instanceof Error ? error.message : String(error));
            }

            this.publish(runId);

            throw error;
        }
    }

    /**
     * Returns a run as its view shows it.
     *
     * @public
     * @param runId The run.
     * @param locale The locale whose rows the view wants.
     * @returns The run.
     * @throws EngineError when the app does not hold the run anymore.
     */
    public get(runId: string, locale: string | null): GenerateRun {
        return this.require(runId).describe(locale);
    }

    /**
     * Returns the setup of a run.
     *
     * @public
     * @param runId The run.
     * @returns The project and the setup.
     */
    public setupOf(runId: string): { projectId: string; input: GenerateInput } {
        const session = this.require(runId);

        return { projectId: session.projectId, input: session.input };
    }

    /**
     * Pauses a run: the chunk in flight finishes, and no new one starts.
     *
     * @public
     * @param runId The run.
     */
    public pause(runId: string): void {
        this.require(runId).pause();
    }

    /**
     * Resumes a run, after a pause or from the chunk that failed.
     *
     * @public
     * @param runId The run.
     */
    public resume(runId: string): void {
        this.require(runId).resume();
    }

    /**
     * Stops a run and keeps what it finished.
     *
     * @public
     * @param runId The run.
     */
    public stop(runId: string): void {
        this.require(runId).stop();
    }

    /**
     * Changes a row of the review. The pending change set follows shortly after.
     *
     * @public
     * @param runId The run.
     * @param locale The locale.
     * @param key The key.
     * @param change What changes.
     * @returns The row.
     */
    public setRow(runId: string, locale: string, key: string, change: { value?: string; accepted?: boolean }): GenerateRow {
        const session = this.require(runId);
        const row = session.setRow(locale, key, change);

        if (session.hasEnded) {
            this.schedulePending(session);
        }

        return row;
    }

    /**
     * Writes the accepted rows of a locale, as one change set that is checked again and written whole or not at all. The review
     * goes on, so what is left stays in a pending change set.
     *
     * @public
     * @param runId The run.
     * @param locale The locale.
     * @param dryRun The value of Dry run.
     * @returns The outcome.
     * @throws EngineError while the run translates, with Dry run on, or when a target changed since the run read it.
     */
    public async write(runId: string, locale: string, dryRun: boolean): Promise<IEngineOutcome<Array<string>> | null> {
        const session = this.require(runId);

        if (dryRun) {
            throw new EngineError('invalid-arguments', 'Dry run is on, so nothing is written. Turn it off in the title bar to write these translations.');
        }

        if (session.status === 'running') {
            throw new EngineError('invalid-arguments', 'Pause the run first, or wait until it has ended.');
        }

        const accepted = session.acceptedRows(locale);
        const rows = Array.from(accepted.values()).flatMap((target) => target.rows);

        if (rows.length === 0) {
            return null;
        }

        const { project } = this._init.workspaces.requireProject(session.projectId);
        Array.from(accepted.keys()).forEach(this._guardPath);

        const changed = Array.from(accepted.keys()).filter((path) => session.hasChangedSinceRead(path));

        if (changed.length > 0) {
            for (const path of changed) {
                session.noteRead(path);
            }

            const names = changed.map((path) => DisplayPath.relativeTo(project.folder, path));

            throw new EngineError('change-set-conflict', `${names.join(', ')} changed since this run read it, so nothing was written. Write again to put the accepted translations on top of the file as it is now.`, names);
        }

        const outcome = await this._init.runner.run(new GenerateWriteUseCase(session), {
            cwd: project.folder,
            options: { locales: [locale], strategy: session.input.provider, count: rows.length, runId: session.runId },
            writeMode: 'apply',
            continuesRun: session.runId
        });

        session.markWritten(rows);
        this._init.catalogs.invalidate(session.projectId);

        for (const path of accepted.keys()) {
            this._contexts.get(runId)?.changes.refresh(path);
            session.noteRead(path);
        }

        if (session.hasEnded) {
            await this.syncPending(session);
        }

        return outcome;
    }

    /**
     * Suggests a value for a key along the path of every translation. It stays a proposal.
     *
     * @public
     * @param projectId The project.
     * @param request What to suggest.
     * @param signal Cancels it.
     * @returns The proposal.
     * @throws EngineError when no provider is set up.
     */
    public async suggestValue(projectId: string, request: { key: string; locale: string; comment: string }, signal?: AbortSignal): Promise<AiValueProposal> {
        const defaults = this.defaults(projectId);
        const { provider, prepared } = await this.prepareActive(defaults);
        const detail = this._init.catalogs.keyDetail(projectId, request.key, request.locale);
        const overview = this._init.catalogs.translationOverview(projectId);
        const proposal = await suggestValue(prepared.strategy, {
            resource: { type: overview.format, locale: overview.baseLocale },
            locale: request.locale,
            model: { key: request.key, value: detail.base, comment: request.comment },
            instructions: [defaults.instructions, defaults.localeInstructions[request.locale] ?? ''],
            retryBudget: 1,
            signal
        });

        return { value: proposal.value, providerName: provider.name, problem: proposal.problem };
    }

    /**
     * Proposes names for hard-coded strings.
     *
     * @public
     * @param projectId The project.
     * @param strings The strings.
     * @param signal Cancels it.
     * @returns The proposals, by the id of their row.
     * @throws EngineError when no provider is set up.
     */
    public async nameKeys(projectId: string, strings: ReadonlyArray<{ id: string; value: string }>, signal?: AbortSignal): Promise<AiKeyNames> {
        const defaults = this.defaults(projectId);
        const { provider, prepared } = await this.prepareActive(defaults);
        const { prefix, suffix } = this._init.projects.settings(projectId);
        const { proposals, dropped } = await nameKeys(prepared.strategy, {
            strings,
            prefix: prefix ?? '',
            suffix: suffix ?? '',
            taken: this._init.catalogs.allKeys(projectId),
            instructions: defaults.instructions,
            signal
        });

        return { names: proposals.map(({ id, key }) => ({ rowId: id, key })), providerName: provider.name, dropped };
    }

    /**
     * Proposes patterns for keys no source mentions.
     *
     * @public
     * @param projectId The project.
     * @param keys The keys.
     * @param signal Cancels it.
     * @returns The proposals.
     * @throws EngineError when no provider is set up.
     */
    public async suggestPatterns(projectId: string, keys: ReadonlyArray<string>, signal?: AbortSignal): Promise<AiPatternProposals> {
        const { provider, prepared } = await this.prepareActive(this.defaults(projectId));
        const { proposals, dropped } = await suggestPatterns(prepared.strategy, { keys, signal });

        return { patterns: proposals, providerName: provider.name, dropped };
    }

    /**
     * Brings what is pending in line before the app quits.
     *
     * @public
     * @returns When it is done.
     */
    public async flush(): Promise<void> {
        const waiting = Array.from(this._pendingTimers.keys());

        for (const runId of waiting) {
            clearTimeout(this._pendingTimers.get(runId));
            this._pendingTimers.delete(runId);

            const session = this._sessions.get(runId);

            if (session) {
                // eslint-disable-next-line no-await-in-loop
                await this.syncPending(session);
            }
        }
    }

    /**
     * Says what an estimate of no chunks covers, so the screen says the same before and after a locale is chosen.
     *
     * @private
     */
    private emptyEstimate(provider: GenerateInput['provider']): { tokensAreLowerBound: boolean; tokensNote: string } {
        const { isLowerBound, note } = estimateTokensFor(provider, [], 0);

        return { tokensAreLowerBound: isLowerBound, tokensNote: note };
    }

    /**
     * Works out the plans of a setup: per locale, the first catalog of the base locale below each resource root, as a command
     * line per root does it.
     *
     * @private
     */
    private planAll(projectId: string, input: GenerateInput): Array<{ locale: string; plans: Array<ISessionPlan>; estimatedTokens: number; instructions: Array<string> }> {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this._init.projects.resolve(project);
        const options = CommandOptions.forGenerate(configuration);
        const bases = this.baseCatalogs(configuration, project, options.resourceRoot, options.type, options.baseLocale);
        const instructionsOf = (locale: string): Array<string> => [input.instructions, options.localeInstructions?.[locale] ?? ''];

        return input.locales.map((locale) => {
            const plans = bases.map((resource): ISessionPlan => {
                const plan = this.planOne(project, resource, locale, input, options.identicalKeys, options.identicalValues);

                return { resource, plan, display: DisplayPath.relativeTo(project.folder, plan.targetPath) };
            });
            const models = plans.flatMap(({ plan }) => plan.models);
            const chunks = plans.reduce((count, { plan }) => count + plan.chunks.length, 0);

            return { locale, plans, instructions: instructionsOf(locale), estimatedTokens: estimateTokensFor(input.provider, models, chunks, instructionsOf(locale)).tokens };
        });
    }

    /**
     * @private
     */
    private planOne(project: ProjectRecord, resource: IResourceInfo, locale: string, input: GenerateInput, identicalKeys: Array<string>, identicalValues: Array<string>): ITranslationPlan {
        const generator = new ResourceGenerator(QUIET_LOGGER, this._init.fileSystem, new ResourceTransformer(QUIET_LOGGER), new ResourceReader(QUIET_LOGGER, this._init.fileSystem), {
            chunkSize: input.chunkSize,
            limit: input.limit,
            scope: input.scope,
            namespace: input.namespace ?? undefined,
            keys: input.keys ?? undefined,
            identicalKeys,
            identicalValues,
            commentOf: createCommentReader(project.folder, resource),
            config: { apiKey: '', model: '', temperature: 0, instructions: '' }
        });

        return generator.plan(resource, locale, input.scope);
    }

    /**
     * @private
     */
    private baseCatalogs(configuration: IResolvedConfiguration, project: ProjectRecord, roots: string | Array<string>, type: ResourceMode, baseLocale: string): Array<IResourceInfo> {
        const reader = new ResourceReader(QUIET_LOGGER, this._init.fileSystem);
        const bases = (Array.isArray(roots) ? roots : [roots])
            .map((root) => reader.scanDirectory(resolve(project.folder, root), type).find((catalog) => catalog.locale === baseLocale))
            .filter((catalog): catalog is IResourceInfo => catalog !== undefined);

        if (bases.length === 0) {
            throw new EngineError('invalid-arguments', `No catalog of the base locale '${baseLocale}' below ${configuration.resourceRoots.map((root) => DisplayPath.relativeTo(project.folder, root)).join(', ')}.`);
        }

        return bases;
    }

    /**
     * @private
     */
    private async prepare(input: Pick<GenerateInput, 'provider' | 'model' | 'temperature' | 'instructions'>): Promise<IPreparedStrategy> {
        const ai = this.requireAi();
        const provider = await ai.get(input.provider);

        if (provider.state === 'not-installed' || provider.state === 'no-key' || provider.state === 'signed-out') {
            throw new EngineError('provider-not-ready', `${provider.name} is not set up: ${provider.description}`);
        }

        return ai.prepare(input.provider, { model: input.model, temperature: input.temperature, instructions: input.instructions });
    }

    /**
     * @private
     */
    private async prepareActive(defaults: AiDefaults): Promise<{ provider: IAiProviderInfo; prepared: IPreparedStrategy }> {
        const ai = this.requireAi();
        const providers = await ai.list();
        const provider = providers.find((candidate) => candidate.id === defaults.defaultProvider && candidate.state === 'ready') ?? providers.find((candidate) => candidate.state === 'ready');

        if (!provider) {
            throw new EngineError('provider-not-ready', 'No AI provider is set up. Open Settings: AI to connect one.');
        }

        const model = provider.kind === 'key' ? defaults.model || (await ai.models(provider.id))[0] || '' : '';

        return { provider, prepared: await ai.prepare(provider.id, { model, temperature: defaults.temperature, instructions: defaults.instructions }) };
    }

    /**
     * @private
     */
    private requireAi(): IAiProviderHost {
        if (!this._init.ai) {
            throw new EngineError('provider-not-ready', 'This surface has no AI providers.');
        }

        return this._init.ai;
    }

    /**
     * @private
     */
    private require(runId: string): TranslationSession {
        const session = this._sessions.get(runId);

        if (!session) {
            throw new EngineError('invalid-arguments', 'This run is no longer held by the app. What it finished waits in Review.');
        }

        return session;
    }

    /**
     * @private
     */
    private remember(session: TranslationSession): void {
        this._sessions.set(session.runId, session);
        this._latest.set(session.projectId, session.runId);

        for (const oldest of this._sessions.keys()) {
            if (this._sessions.size <= MAX_SESSIONS) {
                break;
            }

            if (this._sessions.get(oldest)?.hasEnded) {
                this._sessions.delete(oldest);
                this._contexts.delete(oldest);
            }
        }
    }

    /**
     * @private
     */
    private noteOutcome(session: TranslationSession, changeSet: ChangeSet | null): void {
        if (changeSet?.state === 'pending') {
            session.changeSetId = changeSet.id;
        }

        if (changeSet?.state === 'applied') {
            session.markWritten(Array.from(session.acceptedRows(null).values()).flatMap((target) => target.rows));
            this._init.catalogs.invalidate(session.projectId);
        }

        this.publish(session.runId);
    }

    /**
     * @private
     */
    private schedulePending(session: TranslationSession): void {
        clearTimeout(this._pendingTimers.get(session.runId));
        this._pendingTimers.set(session.runId, setTimeout(() => {
            this._pendingTimers.delete(session.runId);
            void this.syncPending(session).catch(() => undefined);
        }, PENDING_DELAY_MS));
    }

    /**
     * Keeps the pending change set of an ended run in line with its review: what is accepted and not written. It stays in Review
     * however the app ends, and it records no run of its own.
     *
     * @private
     */
    private async syncPending(session: TranslationSession): Promise<void> {
        const { project } = this._init.workspaces.requireProject(session.projectId);
        const now = this._init.now();
        const builder = new ChangeSetBuilder(createSortableId(now), project.folder, now, { command: 'generate', surface: this._init.surface, runId: session.runId, detail: `${session.input.provider}: ${session.input.locales.join(', ')}` });

        for (const { path, content } of await composeTargets(session, null)) {
            builder.propose(path, content);
        }

        const built = builder.build(session.partial);

        if (session.changeSetId) {
            try {
                this._init.reviewList.remove(session.changeSetId);
            } catch {
                // Someone applied or discarded it in Review, which is fine.
            }
        }

        session.changeSetId = built.files.length > 0 ? this._init.reviewList.add(built).id : null;
        this.publish(session.runId);
    }

    /**
     * @private
     */
    private publish(runId: string): void {
        for (const listener of this._listeners) {
            listener(runId);
        }
    }

    // #endregion

}

/**
 * The names of the providers, for a run that may start before their state is known.
 */
const PROVIDER_NAMES: Readonly<Record<GenerateInput['provider'], string>> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    openai: 'OpenAI',
    google: 'Google Gemini'
};

/**
 * Names a locale as the checks of a review say it.
 *
 * @internal
 */
export function nameOfLocale(code: string): string {
    try {
        return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.replace('_', '-')) ?? code;
    } catch {
        return code;
    }
}

/**
 * @private
 */
function isProviderId(value: string | null): value is GenerateInput['provider'] {
    return value !== null && value in PROVIDER_NAMES;
}

/**
 * @private
 */
function optionsOf(input: GenerateInput, options: Pick<IGenerateOptions, 'baseLocale' | 'type' | 'resourceRoot'>): ITranslationRunOptions {
    return {
        strategy: input.provider,
        ...isLocalAssistant(input.provider) ? {} : { model: input.model, temperature: input.temperature },
        locales: input.locales,
        baseLocale: options.baseLocale,
        chunkSize: input.chunkSize,
        limit: input.limit,
        ...input.scope === 'all' ? {} : { scope: input.scope },
        namespace: input.namespace,
        keyCount: input.keys?.length ?? null,
        review: input.reviewBeforeWriting,
        type: options.type,
        resourceRoot: options.resourceRoot
    };
}
