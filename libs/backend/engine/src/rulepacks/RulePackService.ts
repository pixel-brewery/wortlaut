// #region Imports

import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { ChangeSet, ProjectRecord, RuleLockEntry, RulePackAvailable, RulePackCheck, RulePackEntry, RulePackProblem, RulePackRule, RulePackRuleChange, RulePackTarget, RulePackUpdate, RulePackWrite, RuleSeverity, RunCommandName, WorkspaceExportPack, WorkspaceImportResult, WorkspaceRecord, WriteMode, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import { RULE_PACK_FILE_NAME } from '@pixel-brewery/wortlaut-contracts';
import { BUILT_IN_RULE_SEVERITIES } from '@pixel-brewery/wortlaut-core';
import { ChangeSetBuilder } from '../changes/ChangeSetBuilder.js';
import type { ReviewService } from '../changes/ReviewService.js';
import { ConfigurationWriter } from '../configuration/ConfigurationWriter.js';
import { CONFIG_FILE_NAME, type IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import { toConfigurationFile } from '../commands/ProjectCommands.js';
import { createSortableId } from '../io/AtomicFile.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { CommandPrinter } from '../printing/CommandPrinter.js';
import type { ProjectService } from '../projects/ProjectService.js';
import { describeAnalysis } from '../projects/ProjectSummaryBuilder.js';
import type { CommandRunner, IEngineOutcome } from '../runs/CommandRunner.js';
import { RunProjection } from '../runs/RunProjection.js';
import type { RunStore } from '../runs/RunStore.js';
import { RulePackChangeUseCase, type IRulePackChangeOptions } from '../usecases/RulePackChangeUseCase.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import type { IPackFetcher } from './PackFetcher.js';
import { readPackFolder } from './PackFolder.js';
import { PackInspector, type IInspectedPack } from './PackInspector.js';
import { PackProblem } from './PackProblem.js';
import { PackSources, type PackSource } from './PackSource.js';
import { RuleLockFile } from './RuleLockFile.js';
import { RulePackLoader, type ILoadedPack } from './RulePackLoader.js';
import { RuleSettings } from './RuleSettings.js';
import { ShippedPacks } from './ShippedPacks.js';

// #endregion

/**
 * The most checks and reviewed updates that stay around to act on.
 */
const MAX_REMEMBERED = 8;

/**
 * What the built-in rules have in common as a pack.
 */
const BUILT_IN_ACCESS = { declarative: false, readsCatalogs: true, readsSource: true, network: false, ai: false };

/**
 * What the rule packs are composed of.
 *
 * @internal
 */
export interface IRulePackServiceInit {
    runner: CommandRunner;
    runs: RunStore;
    workspaces: WorkspaceService;
    projects: ProjectService;
    review: ReviewService;
    fetcher: IPackFetcher;
    home: string;
    now: () => Date;
}

/**
 * A place with one lock file, and the projects that read it.
 *
 * @public
 */
export interface IPackScope {
    root: string;
    name: string;
    configurations: ReadonlyArray<IResolvedConfiguration>;

    /**
     * The contents of configuration files a project of the app does not have yet, which the change must not lose.
     */
    seeds: ReadonlyMap<string, string>;
}

/**
 * The result of a check.
 *
 * @public
 */
export interface IPackCheckOutcome {
    source: string;
    pack: IInspectedPack | null;
    problem: RulePackProblem | null;
}

/**
 * What an update of a pack would change in one place.
 *
 * @public
 */
export interface IPackUpdatePreview {
    packId: string;
    name: string;
    available: boolean;
    failure: string | null;
    summary: string;
    next: IInspectedPack | null;
    rules: Array<RulePackRuleChange>;
}

/**
 * A pack as a command line lists it.
 *
 * @public
 */
export interface IPackStatus {
    id: string;
    name: string;
    state: 'verified' | 'refused' | 'disabled' | 'built-in';
    reason: string | null;
    source: string;
    version: string | null;
    commit: string | null;
    hash: string | null;
    rules: Array<{ id: string; severity: RuleSeverity }>;
}

/**
 * The rule packs of the engine: it checks what comes from outside, pins it in the lock file through change sets and reports what
 * the lock file says. Fetching and checking run nothing of a pack, and a pack changes only through a change set someone approved.
 *
 * @public
 */
export class RulePackService {

    // #region Fields

    private readonly _init: IRulePackServiceInit;
    private readonly _checks: Map<string, IInspectedPack>;
    private readonly _updates: Map<string, { packId: string; pack: IInspectedPack }>;
    private _guard: (path: string) => void;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RulePackService` class.
     *
     * @param init What it is composed of.
     */
    public constructor(init: IRulePackServiceInit) {
        this._init = init;
        this._checks = new Map();
        this._updates = new Map();
        this._guard = (): void => undefined;
    }

    // #endregion

    // #region Methods

    /**
     * Lets a surface refuse a file before a change writes it, against the folders the user chose.
     *
     * @public
     * @param guard Throws for a path that may not be written.
     */
    public guardPaths(guard: (path: string) => void): void {
        this._guard = guard;
    }

    /**
     * Fetches a pack and checks it. Whatever goes wrong comes back as a problem to show: nothing throws for a bad pack.
     *
     * @public
     * @param source The source as text.
     * @param directory The directory a folder is relative to.
     * @param signal Cancels it.
     * @returns The pack or the problem. Nothing of it ran.
     */
    public async inspect(source: string, directory: string, signal?: AbortSignal): Promise<IPackCheckOutcome> {
        try {
            return await this.inspectSource(PackSources.parse(source, directory), signal);
        } catch (error) {
            return { source, pack: null, problem: this.problemOf(error) };
        }
    }

    /**
     * Fetches a pack from a parsed source and checks it.
     *
     * @public
     * @param source The source.
     * @param signal Cancels it.
     * @returns The pack or the problem.
     */
    public async inspectSource(source: PackSource, signal?: AbortSignal): Promise<IPackCheckOutcome> {
        const directory = source.kind === 'folder' ? RuleLockFile.repositoryOf(source.path) : '';
        const text = PackSources.print(source, directory);

        try {
            return { source: text, pack: await this.fetchPack(source, signal), problem: null };
        } catch (error) {
            return { source: text, pack: null, problem: this.problemOf(error) };
        }
    }

    /**
     * Returns the place a command line works in: the lock file that applies, or the root of the repository for a new one.
     *
     * @public
     * @param cwd The working directory.
     * @param configuration The configuration of the command.
     * @returns The place.
     */
    public scopeAt(cwd: string, configuration: IResolvedConfiguration): IPackScope {
        const root = RuleLockFile.findDirectory(cwd) ?? RuleLockFile.repositoryOf(cwd);

        return { root, name: this.nameOf(root), configurations: [configuration], seeds: new Map() };
    }

    /**
     * Pins a checked pack in one place, as one change set: the lock file and the copy of a fetched pack.
     *
     * @public
     * @param pack The checked pack.
     * @param scope The place.
     * @param writeMode What to do with the change set.
     * @returns The outcome.
     * @throws EngineError for a lock file that cannot be read, a name that is taken or a folder that cannot be pinned for everyone.
     */
    public async install(pack: IInspectedPack, scope: IPackScope, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        const { id, name } = pack.manifest;
        const state = RuleLockFile.read(scope.root);

        this.requireReadable(state.path, state.problem);

        const existing = state.lock.packs[id] as RuleLockEntry | undefined;

        if (existing && existing.hash !== pack.hash) {
            throw new EngineError('rule-pack-invalid', `The pack '${id}' is already pinned with other content. Review its update instead.`, [state.path]);
        }

        this.requireFreeRules(pack, id, state.lock.packs);

        const source = this.pinnedSourceOf(pack, scope.root);
        const files = new Map<string, string>(scope.seeds);

        files.set(state.path, RuleLockFile.print({ schemaVersion: 1, packs: { ...state.lock.packs, [id]: this.entryOf(pack, source) } }));

        if (pack.source.kind !== 'folder') {
            files.set(RulePackLoader.definitionPathOf(scope.root, id, source), pack.text);
        }

        return await this.change('rules.install', `Add rule pack ${name}`, files, [`Pins ${name} ${this.pinNameOf(pack)}.`], { action: 'add', source, pack: id }, scope, writeMode);
    }

    /**
     * Finds out whether a pack has an update, in one place. It changes nothing: a changed pack never updates itself.
     *
     * @public
     * @param scope The place.
     * @param packId The pack.
     * @param signal Cancels it.
     * @returns What an update would change.
     * @throws EngineError when the lock file does not pin the pack.
     */
    public async previewUpdate(scope: IPackScope, packId: string, signal?: AbortSignal): Promise<IPackUpdatePreview> {
        const loaded = RulePackLoader.loadDirectory(scope.root).packs.find((pack) => pack.id === packId);

        if (!loaded) {
            throw new EngineError('rule-pack-invalid', `The lock file pins no pack '${packId}'.`);
        }

        return this.previewFor([loaded], packId, scope.root, signal);
    }

    /**
     * Pins what a review showed, as one change set.
     *
     * @public
     * @param pack What the review showed.
     * @param scope The place.
     * @param packId The pack.
     * @param writeMode What to do with the change set.
     * @returns The outcome.
     * @throws EngineError for a lock file that cannot be read, or a definition that names another pack.
     */
    public async applyUpdate(pack: IInspectedPack, scope: IPackScope, packId: string, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        const { state, files, notes } = this.planUpdate(pack, scope, packId);

        return await this.change('rules.update', `Update rule pack ${state.lock.packs[packId].name}`, files, notes, { action: 'update', pack: packId, source: state.lock.packs[packId].source }, scope, writeMode);
    }

    /**
     * Turns a pack on or off in the projects of one place.
     *
     * @public
     * @param scope The place.
     * @param packId The pack.
     * @param enabled Whether it runs.
     * @param writeMode What to do with the change set.
     * @returns The outcome.
     * @throws EngineError when the lock file does not pin the pack.
     */
    public async setEnabled(scope: IPackScope, packId: string, enabled: boolean, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        if (!RuleLockFile.read(scope.root).lock.packs[packId]) {
            throw new EngineError('rule-pack-invalid', `The lock file pins no pack '${packId}'.`);
        }

        const edits = scope.configurations.map((configuration) => {
            const current = configuration.options.actions?.analyze?.disabledPacks ?? [];
            const value = enabled ? current.filter((id) => id !== packId) : Array.from(new Set([...current, packId]));

            return { configuration, key: 'actions.analyze.disabledPacks', value };
        });

        return await this.changeSettings(`${enabled ? 'Enable' : 'Disable'} rule pack ${packId}`, edits, { action: enabled ? 'enable' : 'disable', pack: packId }, scope, writeMode);
    }

    /**
     * Sets what a rule is worth in the projects of one place. This is the one value behind every switch of a rule.
     *
     * @public
     * @param scope The place.
     * @param ruleId The rule.
     * @param severity The new severity.
     * @param writeMode What to do with the change set.
     * @returns The outcome.
     * @throws EngineError for a rule that nothing here defines.
     */
    public async setSeverity(scope: IPackScope, ruleId: string, severity: RuleSeverity, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        const isKnown = Object.hasOwn(BUILT_IN_RULE_SEVERITIES, ruleId) || Object.values(RuleLockFile.read(scope.root).lock.packs).some((entry) => Object.hasOwn(entry.rules, ruleId));

        if (!isKnown) {
            throw new EngineError('rule-pack-invalid', `No built-in rule and no pinned pack has a rule '${ruleId}'.`);
        }

        const edits = scope.configurations.flatMap((configuration) => RuleSettings.editsFor(configuration.options, ruleId, severity).map((edit) => ({ configuration, ...edit })));

        return await this.changeSettings(`Set ${ruleId} to ${severity}`, edits, { action: 'severity', rule: ruleId, severity }, scope, writeMode);
    }

    /**
     * Lists the packs that apply to a folder, for a command line. A pack that failed its verification says why.
     *
     * @public
     * @param cwd The working directory.
     * @param configuration The configuration of the command.
     * @returns The packs, the built-in rules first.
     */
    public status(cwd: string, configuration: IResolvedConfiguration): Array<IPackStatus> {
        const { options } = configuration;
        const loaded = RulePackLoader.load(cwd, options.actions?.analyze?.disabledPacks ?? []);
        const problem = loaded.lock?.problem ?? null;
        const statuses: Array<IPackStatus> = [{
            id: 'builtin',
            name: 'Built-in rules',
            state: 'built-in',
            reason: null,
            source: 'Included with Wortlaut',
            version: null,
            commit: null,
            hash: null,
            rules: Object.keys(BUILT_IN_RULE_SEVERITIES).map((id) => ({ id, severity: RuleSettings.severityOf(options, id) }))
        }];

        if (problem && loaded.lock) {
            statuses.push({ id: basename(loaded.lock.path), name: basename(loaded.lock.path), state: 'refused', reason: `This file cannot be read, so no pack of it runs: ${problem}`, source: basename(loaded.lock.path), version: null, commit: null, hash: null, rules: [] });
        }

        for (const pack of loaded.packs) {
            statuses.push({
                id: pack.id,
                name: pack.entry.name,
                state: pack.refusal ? 'refused' : pack.enabled ? 'verified' : 'disabled',
                reason: pack.refusal,
                source: pack.entry.source,
                version: pack.entry.version,
                commit: pack.entry.commit,
                hash: pack.entry.hash,
                rules: this.rulesOf(pack).map((rule) => ({ id: rule.id, severity: pack.refusal ? 'off' as const : RuleSettings.severityOf(options, rule.id, rule.severity) }))
            });
        }

        return statuses;
    }

    /**
     * Checks a pack for Add a rule pack and remembers it, so Install and pin writes exactly what was checked.
     *
     * @public
     * @param source The source.
     * @param session What is open in the app.
     * @param session.workspaceId The open workspace.
     * @param session.projectId The open project.
     * @param signal Cancels it.
     * @returns What the dialog shows.
     */
    public async check(source: PackSource, session: { workspaceId: string | null; projectId: string | null }, signal?: AbortSignal): Promise<RulePackCheck> {
        const outcome = await this.inspectSource(source, signal);
        const { pack } = outcome;

        if (!pack) {
            return { checkId: null, source: outcome.source, sameAs: null, problem: outcome.problem, pack: null, targets: [], targetsNote: null };
        }

        const { targets, note } = this.targetsOf(pack, session);
        const checkId = createSortableId(this._init.now());
        const printed = PackSources.print(source, source.kind === 'folder' ? this.homeOfFolder(source.path, targets, session) : '');

        this.remember(this._checks, checkId, pack);

        return {
            checkId: targets.length > 0 ? checkId : null,
            source: printed,
            sameAs: CommandPrinter.printRulesAdd(printed),
            problem: null,
            pack: {
                id: pack.manifest.id,
                name: pack.manifest.name,
                description: pack.manifest.description,
                version: pack.manifest.version,
                commit: pack.commit,
                hash: pack.hash,
                rules: pack.manifest.rules.map((rule) => ({ id: rule.id, description: rule.description, severity: rule.severity ?? 'warning' })),
                access: pack.access
            },
            targets,
            targetsNote: note
        };
    }

    /**
     * Checks a pack that is named as text. Text that names nothing is a problem to show, like any other.
     *
     * @public
     * @param text The source, which has to name a repository, a package or a pack of Wortlaut, never a path.
     * @param session What is open in the app.
     * @param session.workspaceId The open workspace.
     * @param session.projectId The open project.
     * @param signal Cancels it.
     * @returns What the dialog shows.
     */
    public async checkText(text: string, session: { workspaceId: string | null; projectId: string | null }, signal?: AbortSignal): Promise<RulePackCheck> {
        let source: PackSource;

        try {
            source = PackSources.parse(text, '');
        } catch (error) {
            return { checkId: null, source: text, sameAs: null, problem: this.problemOf(error), pack: null, targets: [], targetsNote: null };
        }

        return this.check(source, session, signal);
    }

    /**
     * Pins a checked pack for a workspace or for one project, with one change set per repository.
     *
     * @public
     * @param checkId The check.
     * @param target Where it goes.
     * @param dryRun The value of Dry run.
     * @returns What became of it per repository.
     * @throws EngineError when the check is gone.
     */
    public async installTo(checkId: string, target: RulePackTarget, dryRun: boolean): Promise<RulePackWrite> {
        const pack = this._checks.get(checkId);

        if (!pack) {
            throw new EngineError('invalid-arguments', 'This check is no longer available. Check the pack again.');
        }

        const scopes = this.targetScopes(target).filter((scope) => this.canPin(pack, scope.root));

        if (scopes.length === 0) {
            throw new EngineError('rule-pack-invalid', 'A folder outside of the repository cannot be pinned for everyone. Move it into the repository and check it again.');
        }

        return this.forEachScope(scopes, (scope) => this.install(pack, scope, this.writeModeOf(dryRun)));
    }

    /**
     * Lists the packs of a workspace as Rule packs shows them. A pack that failed its verification is listed with why.
     *
     * @public
     * @param workspaceId The workspace.
     * @returns The packs, the built-in rules first.
     */
    public list(workspaceId: string): Array<RulePackEntry> {
        const workspace = this._init.workspaces.require(workspaceId);
        const scopes = this.lockScopes(workspace);
        const analyses = this.latestAnalyses(workspace);
        const first = scopes.flatMap((scope) => scope.configurations)[0];
        const builtIn: RulePackEntry = {
            id: 'builtin',
            name: 'Built-in rules',
            description: 'Included with Wortlaut.',
            locked: true,
            enabled: true,
            rules: Object.keys(BUILT_IN_RULE_SEVERITIES).map((id) => this.ruleRow(id, RuleSettings.descriptionOf(id), first ? RuleSettings.severityOf(first.options, id) : BUILT_IN_RULE_SEVERITIES[id], analyses, false)),
            refusal: null,
            source: 'Included with Wortlaut',
            version: null,
            commit: null,
            hash: null,
            access: BUILT_IN_ACCESS,
            repositories: []
        };
        const packs = new Map<string, RulePackEntry>();

        for (const scope of scopes) {
            const loaded = RulePackLoader.loadDirectory(scope.root, this.disabledIn(scope));

            for (const pack of loaded.packs) {
                packs.set(pack.id, this.mergeEntry(packs.get(pack.id) ?? null, pack, scope, analyses));
            }

            if (loaded.lock?.problem) {
                packs.set(`lock-${scope.root}`, this.unreadableLockEntry(basename(loaded.lock.path), loaded.lock.problem, scope));
            }
        }

        return [builtIn, ...packs.values()];
    }

    /**
     * Lists what Wortlaut ships and this workspace does not pin yet.
     *
     * @public
     * @param workspaceId The workspace.
     * @returns The packs.
     */
    public available(workspaceId: string): Array<RulePackAvailable> {
        const installed = new Set(this.lockScopes(this._init.workspaces.require(workspaceId)).flatMap((scope) => Object.keys(RuleLockFile.read(scope.root).lock.packs)));

        return ShippedPacks.all().filter((pack) => !installed.has(pack.id))
            .map((pack) => ({ id: pack.id, name: pack.manifest.name, description: pack.manifest.description, source: `wortlaut:${pack.id}` }));
    }

    /**
     * Lists what the repositories of a workspace pin, as references for a file that moves it. A folder inside of a repository stays
     * as its relative source, because that repository brings it along.
     *
     * @public
     * @param workspaceId The workspace.
     * @returns The references, one per pack.
     */
    public pinnedReferences(workspaceId: string): Array<WorkspaceExportPack> {
        const references = new Map<string, WorkspaceExportPack>();

        for (const scope of this.lockScopes(this._init.workspaces.require(workspaceId))) {
            for (const [id, entry] of Object.entries(RuleLockFile.read(scope.root).lock.packs)) {
                if (!references.has(id)) {
                    references.set(id, { id, name: entry.name, source: entry.source, version: entry.version, commit: entry.commit, hash: entry.hash });
                }
            }
        }

        return Array.from(references.values());
    }

    /**
     * Pins a pack that a file names for a workspace. The source has to give exactly what the file pinned, so a file cannot bring in
     * another pack under a known name, and the pin takes the path of every pack: its check, one change set per repository, Dry run.
     *
     * @public
     * @param workspaceId The workspace.
     * @param reference The pack as the file names it.
     * @param dryRun The value of Dry run.
     * @returns What became of it.
     */
    public async importReference(workspaceId: string, reference: WorkspaceExportPack, dryRun: boolean): Promise<{ state: WorkspaceImportResult['packs'][number]['state']; detail: string | null }> {
        const scopes = this.repositoryScopes(this._init.workspaces.require(workspaceId));

        if (scopes.length === 0) {
            return { state: 'skipped', detail: 'This workspace has no folder yet. Add the pack once it has one.' };
        }

        if (scopes.every((scope) => RuleLockFile.read(scope.root).lock.packs[reference.id]?.hash === reference.hash)) {
            return { state: 'pinned', detail: null };
        }

        if (!reference.source.startsWith('github:') && !reference.source.startsWith('npm:') && !reference.source.startsWith('wortlaut:')) {
            return { state: 'skipped', detail: 'This pack comes with its repository, and that repository does not hold it here.' };
        }

        try {
            const check = await this.checkText(reference.source, { workspaceId, projectId: null });

            if (!check.pack || !check.checkId) {
                return { state: 'refused', detail: check.problem?.message ?? 'Its source could not be checked.' };
            }

            if (check.pack.hash !== reference.hash) {
                return { state: 'refused', detail: 'Its source no longer gives what this file pinned, so nothing was added.' };
            }

            const { results } = await this.installTo(check.checkId, { kind: 'workspace', workspaceId }, dryRun);
            const failure = results.find((result) => result.failure)?.failure;

            if (failure) {
                return { state: 'refused', detail: DisplayPath.scrub(failure, this._init.home) };
            }

            return { state: results.some((result) => result.outcome?.state === 'pending') ? 'pending' : 'written', detail: null };
        } catch (error) {
            return { state: 'refused', detail: DisplayPath.scrub(error instanceof Error ? error.message : String(error), this._init.home) };
        }
    }

    /**
     * Counts the packs that are enabled and pass their verification in a workspace.
     *
     * @public
     * @param workspaceId The workspace.
     * @returns The number.
     */
    public enabledCount(workspaceId: string): number {
        return this.list(workspaceId).filter((pack) => !pack.locked && pack.enabled && !pack.refusal).length;
    }

    /**
     * Turns a pack on or off in a workspace, with one change set per repository that pins it.
     *
     * @public
     * @param workspaceId The workspace.
     * @param packId The pack.
     * @param enabled Whether it runs.
     * @param dryRun The value of Dry run.
     * @returns What became of it per repository.
     */
    public setEnabledIn(workspaceId: string, packId: string, enabled: boolean, dryRun: boolean): Promise<RulePackWrite> {
        const scopes = this.lockScopes(this._init.workspaces.require(workspaceId)).filter((scope) => Boolean(RuleLockFile.read(scope.root).lock.packs[packId]));

        return this.forEachScope(scopes, (scope) => this.setEnabled(scope, packId, enabled, this.writeModeOf(dryRun)));
    }

    /**
     * Sets what a rule is worth in a workspace, with one change set per repository that has the rule.
     *
     * @public
     * @param workspaceId The workspace.
     * @param ruleId The rule.
     * @param severity The new severity.
     * @param dryRun The value of Dry run.
     * @returns What became of it per repository.
     */
    public setSeverityIn(workspaceId: string, ruleId: string, severity: RuleSeverity, dryRun: boolean): Promise<RulePackWrite> {
        const isBuiltIn = Object.hasOwn(BUILT_IN_RULE_SEVERITIES, ruleId);
        const scopes = this.lockScopes(this._init.workspaces.require(workspaceId))
            .filter((scope) => scope.configurations.length > 0 && (isBuiltIn || Object.values(RuleLockFile.read(scope.root).lock.packs).some((entry) => Object.hasOwn(entry.rules, ruleId))));

        return this.forEachScope(scopes, (scope) => this.setSeverity(scope, ruleId, severity, this.writeModeOf(dryRun)));
    }

    /**
     * Works out Review update: the new commit, the rule changes and the diff of the lock file per repository. It fetches, compares
     * and remembers what it fetched, and it writes nothing.
     *
     * @public
     * @param workspaceId The workspace.
     * @param packId The pack.
     * @param signal Cancels it.
     * @returns What Review update shows. A source that cannot be reached is an answer, not a failure.
     */
    public async checkUpdate(workspaceId: string, packId: string, signal?: AbortSignal): Promise<RulePackUpdate> {
        const scopes = this.lockScopes(this._init.workspaces.require(workspaceId)).filter((scope) => Boolean(RuleLockFile.read(scope.root).lock.packs[packId]));

        if (scopes.length === 0) {
            throw new EngineError('rule-pack-invalid', `This workspace pins no pack '${packId}'.`);
        }

        const loaded = scopes.flatMap((scope) => RulePackLoader.loadDirectory(scope.root).packs.filter((pack) => pack.id === packId));
        const preview = await this.previewFor(loaded, packId, scopes[0].root, signal);
        const { next } = preview;

        if (!preview.available || !next) {
            return { packId, name: preview.name, available: false, failure: preview.failure, updateId: null, summary: preview.summary, next: null, access: null, rules: [], repositories: [] };
        }

        const updateId = createSortableId(this._init.now());

        this._updates.set(updateId, { packId, pack: next });
        this.forgetOldest(this._updates);

        return {
            packId,
            name: preview.name,
            available: true,
            failure: null,
            updateId,
            summary: preview.summary,
            next: { version: next.version, commit: next.commit, hash: next.hash },
            access: next.access,
            rules: preview.rules,
            repositories: scopes.map((scope, index) => ({
                repository: scope.name,
                commit: loaded[index].entry.commit,
                version: loaded[index].entry.version,
                hash: loaded[index].entry.hash,
                files: this.previewFiles(next, scope, packId)
            }))
        };
    }

    /**
     * Pins exactly what Review update showed, with one change set per repository that pins the pack.
     *
     * @public
     * @param workspaceId The workspace.
     * @param updateId What the review fetched.
     * @param dryRun The value of Dry run.
     * @returns What became of it per repository.
     * @throws EngineError when the review is gone.
     */
    public async updateIn(workspaceId: string, updateId: string, dryRun: boolean): Promise<RulePackWrite> {
        const update = this._updates.get(updateId);

        if (!update) {
            throw new EngineError('invalid-arguments', 'This review is no longer available. Review the update again.');
        }

        const scopes = this.lockScopes(this._init.workspaces.require(workspaceId)).filter((scope) => Boolean(RuleLockFile.read(scope.root).lock.packs[update.packId]));

        return this.forEachScope(scopes, (scope) => this.applyUpdate(update.pack, scope, update.packId, this.writeModeOf(dryRun)));
    }

    /**
     * @private
     */
    private async fetchPack(source: PackSource, signal?: AbortSignal): Promise<IInspectedPack> {
        const { fetcher } = this._init;

        switch (source.kind) {
            case 'github': {
                const commit = await fetcher.resolveCommit(source.owner, source.repository, source.ref, signal);

                return PackInspector.inspect(await fetcher.downloadCommit(source.owner, source.repository, commit, signal), { source, commit, version: null });
            }
            case 'npm': {
                const found = await fetcher.resolvePackage(source.name, source.version, signal);

                return PackInspector.inspect(await fetcher.downloadPackage(found, signal), { source, commit: null, version: found.version });
            }
            case 'shipped': {
                const text = ShippedPacks.textOf(source.id);

                if (text === null) {
                    throw new PackProblem('not-found', `Wortlaut ships no pack '${source.id}'.`);
                }

                return PackInspector.inspect([{ path: RULE_PACK_FILE_NAME, bytes: Buffer.from(text, 'utf8') }], { source, commit: null, version: null });
            }
            default:
                return PackInspector.inspect(readPackFolder(source.path), { source, commit: null, version: null });
        }
    }

    /**
     * @private
     */
    private problemOf(error: unknown): RulePackProblem {
        return error instanceof PackProblem ? error.describe() : { kind: 'network', message: error instanceof Error ? error.message : String(error), details: [] };
    }

    /**
     * Asks the source of a pack for what it holds now. A source that says the pin is still current is not downloaded again, unless
     * the pack failed its verification, which a fresh copy can repair.
     *
     * @private
     */
    private async previewFor(loaded: ReadonlyArray<ILoadedPack>, packId: string, directory: string, signal?: AbortSignal): Promise<IPackUpdatePreview> {
        const [first] = loaded;
        const name = first.manifest?.name ?? first.entry.name;
        const none = (summary: string, failure: string | null = null): IPackUpdatePreview => ({ packId, name, available: false, failure, summary, next: null, rules: [] });

        try {
            const source = PackSources.parse(first.entry.source, directory);
            const isRefused = loaded.some((pack) => Boolean(pack.refusal));

            if (!isRefused && await this.isCurrent(source, loaded, signal)) {
                return none('This pack is up to date.');
            }

            const next = await this.fetchPack(source, signal);

            if (next.manifest.id !== packId) {
                return none('', `The source now holds the pack '${next.manifest.id}', not '${packId}'.`);
            }

            const isSame = (pack: ILoadedPack): boolean => !pack.refusal && pack.entry.hash === next.hash && pack.entry.commit === next.commit && pack.entry.version === next.version;

            if (loaded.every(isSame)) {
                return none('This pack is up to date.');
            }

            const rules = this.ruleChanges(first, next);

            return { packId, name, available: true, failure: null, summary: this.summarize(rules, next, first), next, rules };
        } catch (error) {
            return none('', this.problemOf(error).message);
        }
    }

    /**
     * @private
     */
    private async isCurrent(source: PackSource, loaded: ReadonlyArray<ILoadedPack>, signal?: AbortSignal): Promise<boolean> {
        if (source.kind === 'github') {
            const commit = await this._init.fetcher.resolveCommit(source.owner, source.repository, source.ref, signal);

            return loaded.every((pack) => pack.entry.commit === commit);
        }

        if (source.kind === 'npm') {
            const { version } = await this._init.fetcher.resolvePackage(source.name, source.version, signal);

            return loaded.every((pack) => pack.entry.version === version);
        }

        return false;
    }

    /**
     * @private
     */
    private ruleChanges(current: ILoadedPack, next: IInspectedPack): Array<RulePackRuleChange> {
        const pinned = current.entry.rules;
        const describe = (id: string): string => current.manifest?.rules.find((rule) => rule.id === id)?.description ?? '';
        const changes = new Array<RulePackRuleChange>();

        for (const rule of next.manifest.rules) {
            if (!Object.hasOwn(pinned, rule.id)) {
                changes.push({ id: rule.id, change: 'added', description: rule.description });
            } else if (pinned[rule.id] !== next.ruleHashes[rule.id]) {
                changes.push({ id: rule.id, change: 'changed', description: rule.description });
            }
        }

        for (const id of Object.keys(pinned)) {
            if (!Object.hasOwn(next.ruleHashes, id)) {
                changes.push({ id, change: 'removed', description: describe(id) });
            }
        }

        return changes;
    }

    /**
     * @private
     */
    private summarize(rules: ReadonlyArray<RulePackRuleChange>, next: IInspectedPack, current: ILoadedPack): string {
        const count = (change: RulePackRuleChange['change'], word: string): string | null => {
            const total = rules.filter((rule) => rule.change === change).length;

            return total > 0 ? `${total} ${word} ${total === 1 ? 'rule' : 'rules'}` : null;
        };
        const parts = [count('added', 'new'), count('changed', 'changed'), count('removed', 'removed')].filter((part) => part !== null);
        const pin = this.pinNameOf(next);

        if (parts.length > 0) {
            return `${parts.join(', ')}, ${pin}`;
        }

        return current.refusal ? `Pins it again to what the source holds, ${pin}` : `No rule changes, ${pin}`;
    }

    /**
     * @private
     */
    private pinNameOf(pack: IInspectedPack): string {
        if (pack.commit) {
            return `commit ${pack.commit.slice(0, 7)}`;
        }

        return pack.source.kind === 'folder' ? `hash ${pack.hash.slice(0, 'sha256:'.length + 8)}` : `version ${pack.version}`;
    }

    /**
     * @private
     */
    private planUpdate(pack: IInspectedPack, scope: IPackScope, packId: string): { state: ReturnType<typeof RuleLockFile.read>; files: Map<string, string>; notes: Array<string> } {
        const state = RuleLockFile.read(scope.root);

        this.requireReadable(state.path, state.problem);

        const current = state.lock.packs[packId] as RuleLockEntry | undefined;

        if (!current) {
            throw new EngineError('rule-pack-invalid', `The lock file pins no pack '${packId}'.`);
        }

        if (pack.manifest.id !== packId) {
            throw new EngineError('rule-pack-invalid', `The new definition names the pack '${pack.manifest.id}', not '${packId}'.`);
        }

        this.requireFreeRules(pack, packId, state.lock.packs);

        const files = new Map<string, string>();

        files.set(state.path, RuleLockFile.print({ schemaVersion: 1, packs: { ...state.lock.packs, [packId]: this.entryOf(pack, current.source) } }));

        if (pack.source.kind !== 'folder') {
            files.set(RulePackLoader.definitionPathOf(scope.root, packId, current.source), pack.text);
        }

        return { state, files, notes: [`Pins ${pack.manifest.name} ${this.pinNameOf(pack)}.`] };
    }

    /**
     * @private
     */
    private previewFiles(pack: IInspectedPack, scope: IPackScope, packId: string): RulePackUpdate['repositories'][number]['files'] {
        const { files } = this.planUpdate(pack, scope, packId);
        const builder = new ChangeSetBuilder('preview', scope.root, this._init.now(), { command: 'rules.update', surface: 'desktop', runId: 'preview', detail: null });

        for (const [path, content] of files) {
            builder.propose(path, content);
        }

        return builder.build(false).files.map((file) => this._init.review.previewFile(file));
    }

    /**
     * @private
     */
    private entryOf(pack: IInspectedPack, source: string): RuleLockEntry {
        return {
            name: pack.manifest.name,
            source,
            version: pack.version,
            commit: pack.commit,
            hash: pack.hash,
            rules: pack.ruleHashes
        };
    }

    /**
     * A folder is pinned by its hash, and only inside the repository, because outside of it nobody else has that folder.
     *
     * @private
     */
    private pinnedSourceOf(pack: IInspectedPack, root: string): string {
        if (pack.source.kind !== 'folder') {
            return PackSources.print(pack.source, root);
        }

        if (!this.canPin(pack, root)) {
            throw new EngineError('rule-pack-invalid', 'A folder outside of the repository cannot be pinned for everyone. Move it into the repository and check it again.');
        }

        return PackSources.print({ kind: 'folder', path: this.realPathOf(pack.source.path) }, this.realPathOf(root));
    }

    /**
     * @private
     */
    private canPin(pack: IInspectedPack, root: string): boolean {
        return pack.source.kind !== 'folder' || PathResolver.isInside(this.realPathOf(RuleLockFile.repositoryOf(root)), this.realPathOf(pack.source.path));
    }

    /**
     * @private
     */
    private realPathOf(path: string): string {
        try {
            return realpathSync(path);
        } catch {
            return resolve(path);
        }
    }

    /**
     * @private
     */
    private requireReadable(path: string, problem: string | null): void {
        if (problem) {
            throw new EngineError('rule-pack-invalid', `${basename(path)} cannot be read, and Wortlaut does not write over it: ${problem}`, [path]);
        }
    }

    /**
     * @private
     */
    private requireFreeRules(pack: IInspectedPack, id: string, packs: Readonly<Record<string, RuleLockEntry>>): void {
        for (const [otherId, other] of Object.entries(packs)) {
            const taken = otherId === id ? undefined : pack.manifest.rules.find((rule) => Object.hasOwn(other.rules, rule.id));

            if (taken) {
                throw new EngineError('rule-pack-invalid', `The pack '${otherId}' already has a rule '${taken.id}'.`);
            }
        }
    }

    /**
     * @private
     */
    private changeSettings(detail: string, edits: ReadonlyArray<{ configuration: IResolvedConfiguration; key: string; value: unknown }>, options: IRulePackChangeOptions, scope: IPackScope, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        const texts = new Map<string, string>(scope.seeds);
        const touched = new Set<string>();

        for (const { configuration, key, value } of edits) {
            touched.add(ConfigurationWriter.edit(configuration, key, value, texts).file);
        }

        const files = new Map(Array.from(touched, (file) => [file, texts.get(file) as string]));

        return this.change('rules.settings', detail, files, [], options, scope, writeMode);
    }

    /**
     * Runs one change in one place, so it is one change set.
     *
     * @private
     */
    private async change(command: RunCommandName, detail: string, files: ReadonlyMap<string, string>, notes: ReadonlyArray<string>, options: IRulePackChangeOptions, scope: IPackScope, writeMode: WriteMode): Promise<IEngineOutcome<Array<string>>> {
        for (const path of files.keys()) {
            this._guard(path);
        }

        const outcome = await this._init.runner.run(new RulePackChangeUseCase(command, detail, files, notes), { cwd: scope.root, options, writeMode });

        if (outcome.changeSet?.state === 'pending') {
            this._init.review.removeRepeats(outcome.changeSet);
        }

        return outcome;
    }

    /**
     * @private
     */
    private async forEachScope(scopes: ReadonlyArray<IPackScope>, run: (scope: IPackScope) => Promise<IEngineOutcome<Array<string>>>): Promise<RulePackWrite> {
        const results: RulePackWrite['results'] = [];

        for (const scope of scopes) {
            try {
                results.push({ repository: scope.name, outcome: this.outcomeOf(await run(scope)), failure: null });
            } catch (error) {
                results.push({ repository: scope.name, outcome: null, failure: DisplayPath.scrub(error instanceof Error ? error.message : String(error), this._init.home) });
            }
        }

        return { results };
    }

    /**
     * @private
     */
    private outcomeOf(outcome: IEngineOutcome<Array<string>>): WriteOutcome {
        const changeSet: ChangeSet | null = outcome.changeSet;

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
    private writeModeOf(dryRun: boolean): WriteMode {
        return dryRun ? 'review' : 'apply';
    }

    /**
     * Lists where a checked pack can go. A folder only goes where it lies inside the repository.
     *
     * @private
     */
    private targetsOf(pack: IInspectedPack, session: { workspaceId: string | null; projectId: string | null }): { targets: RulePackCheck['targets']; note: string | null } {
        const workspaces = this._init.workspaces.all().sort((a, b) => Number(b.id === session.workspaceId) - Number(a.id === session.workspaceId));
        const targets: RulePackCheck['targets'] = [];

        for (const workspace of workspaces) {
            if (this.repositoryScopes(workspace).some((scope) => this.canPin(pack, scope.root))) {
                targets.push({ target: { kind: 'workspace', workspaceId: workspace.id }, label: `Workspace ${workspace.name}` });
            }
        }

        if (session.projectId) {
            const { project } = this._init.workspaces.requireProject(session.projectId);

            if (this.canPin(pack, project.folder)) {
                targets.push({ target: { kind: 'project', projectId: project.id }, label: `Only project ${project.name}` });
            }
        }

        return {
            targets,
            note: targets.length === 0 ? 'This folder lies outside of every repository, and a folder there cannot be pinned for everyone. Move it into a repository and check it again.' : null
        };
    }

    /**
     * Finds the folder a pack folder is written relative to: the repository of the place it can go to.
     *
     * @private
     */
    private homeOfFolder(path: string, targets: RulePackCheck['targets'], session: { workspaceId: string | null; projectId: string | null }): string {
        const roots = targets.flatMap(({ target }) => this.targetScopes(target).map((scope) => scope.root));
        const home = roots.find((root) => PathResolver.isInside(root, path));

        return home ?? (session.projectId ? this._init.workspaces.requireProject(session.projectId).project.folder : RuleLockFile.repositoryOf(path));
    }

    /**
     * @private
     */
    private targetScopes(target: RulePackTarget): Array<IPackScope> {
        if (target.kind === 'workspace') {
            return this.repositoryScopes(this._init.workspaces.require(target.workspaceId));
        }

        const { project } = this._init.workspaces.requireProject(target.projectId);

        return [this.scopeOf(project.folder, [project])];
    }

    /**
     * Returns one place per repository of a workspace, for what goes into each of them.
     *
     * @private
     */
    private repositoryScopes(workspace: WorkspaceRecord): Array<IPackScope> {
        const inRepository = (project: ProjectRecord, repository: string): boolean => PathResolver.isInside(repository, project.folder);
        const outside = workspace.projects.filter((project) => !workspace.repositories.some((repository) => inRepository(project, repository)));

        return [
            ...workspace.repositories.map((repository) => this.scopeOf(repository, workspace.projects.filter((project) => inRepository(project, repository)))),
            ...outside.map((project) => this.scopeOf(project.folder, [project]))
        ];
    }

    /**
     * Returns the places of a workspace with a lock file that applies to a project, and the repositories without one.
     *
     * @private
     */
    private lockScopes(workspace: WorkspaceRecord): Array<IPackScope> {
        const scopes = new Map<string, Array<ProjectRecord>>();
        const repositoryOf = (project: ProjectRecord): string => workspace.repositories.find((repository) => PathResolver.isInside(repository, project.folder)) ?? project.folder;

        for (const project of workspace.projects) {
            const root = RuleLockFile.findDirectory(project.folder) ?? repositoryOf(project);

            scopes.set(root, [...scopes.get(root) ?? [], project]);
        }

        for (const repository of workspace.repositories) {
            if (!Array.from(scopes.keys()).some((root) => PathResolver.isInside(repository, root))) {
                scopes.set(repository, []);
            }
        }

        return Array.from(scopes.entries()).map(([root, projects]) => this.scopeOf(root, projects));
    }

    /**
     * @private
     */
    private scopeOf(root: string, projects: ReadonlyArray<ProjectRecord>): IPackScope {
        const configurations = new Array<IResolvedConfiguration>();
        const seeds = new Map<string, string>();

        for (const project of projects) {
            try {
                const configuration = this._init.projects.resolve(project);

                configurations.push(configuration);

                // A project that was set up in the app has its choices in the profile, and the repository gets them with this.
                if (project.setup && !configuration.configFile && !configuration.nxTarget) {
                    seeds.set(resolve(configuration.cwd, CONFIG_FILE_NAME), `${JSON.stringify(toConfigurationFile(project.folder, project.setup), null, 2)}\n`);
                }
            } catch {
                // A project that cannot be resolved shows its failure on its own screens. It has no settings to change here.
            }
        }

        return { root, name: this.nameOf(root), configurations, seeds };
    }

    /**
     * @private
     */
    private nameOf(root: string): string {
        return DisplayPath.of(root, this._init.home);
    }

    /**
     * A pack counts as off in a place when every project there turned it off.
     *
     * @private
     */
    private disabledIn(scope: IPackScope): Array<string> {
        const [first, ...rest] = scope.configurations.map((configuration) => configuration.options.actions?.analyze?.disabledPacks ?? []);

        return (first ?? []).filter((id) => rest.every((list) => list.includes(id)));
    }

    /**
     * @private
     */
    private latestAnalyses(workspace: WorkspaceRecord): Array<ReturnType<typeof describeAnalysis>> {
        const runs = this._init.runs.list();

        return workspace.projects.flatMap((project) => {
            const run = runs.find((candidate) => candidate.command === 'analyze' && candidate.state === 'succeeded' && RunProjection.belongsTo(candidate, project.folder));

            return run ? [describeAnalysis(run)] : [];
        });
    }

    /**
     * @private
     */
    private ruleRow(id: string, description: string, severity: RuleSeverity, analyses: ReadonlyArray<ReturnType<typeof describeAnalysis>>, isRefused: boolean): RulePackRule {
        if (isRefused) {
            return { id, description, severity, result: 'Refused', variant: 'danger' };
        }

        if (severity === 'off') {
            return { id, description, severity, result: 'Off', variant: 'neutral' };
        }

        const results = analyses.flatMap((analysis) => analysis.rules.filter((rule) => rule.id === id));
        const failing = results.filter((rule) => !rule.passed).length;

        if (failing > 0) {
            return { id, description, severity, result: `${failing} ${failing === 1 ? 'project' : 'projects'} failing`, variant: severity === 'error' ? 'danger' : 'warning' };
        }

        return results.length > 0 ? { id, description, severity, result: 'Pass', variant: 'success' } : { id, description, severity, result: 'Not run', variant: 'neutral' };
    }

    /**
     * @private
     */
    private rulesOf(pack: ILoadedPack): Array<{ id: string; description: string; severity: RuleSeverity | undefined }> {
        return pack.manifest
            ? pack.manifest.rules.map((rule) => ({ id: rule.id, description: rule.description, severity: rule.severity }))
            : Object.keys(pack.entry.rules).map((id) => ({ id, description: '', severity: undefined }));
    }

    /**
     * Joins what the repositories of a workspace say about a pack. A refusal in one repository is the state of the pack.
     *
     * @private
     */
    private mergeEntry(current: RulePackEntry | null, pack: ILoadedPack, scope: IPackScope, analyses: ReadonlyArray<ReturnType<typeof describeAnalysis>>): RulePackEntry {
        const repositories = [...current?.repositories ?? [], scope.name];
        const [configuration] = scope.configurations;

        if (current && !current.refusal && !pack.refusal) {
            return { ...current, enabled: current.enabled || pack.enabled, repositories };
        }

        if (current?.refusal) {
            return { ...current, repositories };
        }

        return {
            id: pack.id,
            name: pack.manifest?.name ?? pack.entry.name,
            description: pack.manifest?.description ?? 'This pack failed its verification.',
            locked: false,
            enabled: pack.enabled,
            rules: this.rulesOf(pack).map((rule) => this.ruleRow(
                rule.id,
                rule.description,
                pack.refusal ? 'off' : configuration ? RuleSettings.severityOf(configuration.options, rule.id, rule.severity) : rule.severity ?? 'warning',
                analyses,
                pack.refusal !== null
            )),
            refusal: pack.refusal ? { reason: DisplayPath.scrub(pack.refusal, this._init.home), repository: scope.name, pinnedHash: pack.entry.hash, foundHash: pack.foundHash } : null,
            source: pack.entry.source,
            version: pack.entry.version,
            commit: pack.entry.commit,
            hash: pack.entry.hash,
            access: pack.manifest ? PackInspector.accessOf(pack.manifest) : { declarative: true, readsCatalogs: true, readsSource: false, network: false, ai: false },
            repositories
        };
    }

    /**
     * @private
     */
    private unreadableLockEntry(file: string, problem: string, scope: IPackScope): RulePackEntry {
        return {
            id: 'lock-file',
            name: file,
            description: 'The lock file of this repository cannot be read.',
            locked: true,
            enabled: false,
            rules: [],
            refusal: { reason: DisplayPath.scrub(`This file cannot be read, so no pack of it runs: ${problem}`, this._init.home), repository: scope.name, pinnedHash: null, foundHash: null },
            source: file,
            version: null,
            commit: null,
            hash: null,
            access: { declarative: true, readsCatalogs: false, readsSource: false, network: false, ai: false },
            repositories: [scope.name]
        };
    }

    /**
     * @private
     */
    private remember<T>(store: Map<string, T>, id: string, value: T): void {
        store.set(id, value);
        this.forgetOldest(store);
    }

    /**
     * @private
     */
    private forgetOldest<T>(store: Map<string, T>): void {
        for (const oldest of store.keys()) {
            if (store.size <= MAX_REMEMBERED) {
                break;
            }

            store.delete(oldest);
        }
    }

    // #endregion

}
