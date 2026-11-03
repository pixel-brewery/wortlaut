// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { isSecretName, PresetSchema, type EffectiveSettings, type LabeledCommand, type McpActivity, type NxTargets, type ProjectList, type ProjectRecord, type ProjectRow, type ProjectSettings, type ProjectState, type ProjectSummary, type RunAllCommand, type RunDetail, type RunRecord, type RunSummary, type SettingsSourceFile, type SharedDefault, type WorkspaceRecord } from '@pixel-brewery/wortlaut-contracts';
import { ResourceAnalyzer, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import { isWortlautExecutor, type ConfigurationResolver, type IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { CommandPrinter } from '../printing/CommandPrinter.js';
import { RunProjection } from '../runs/RunProjection.js';
import type { RunStore } from '../runs/RunStore.js';
import { workspaceFolderOf } from './ProjectInspector.js';
import { ProjectSummaryBuilder } from './ProjectSummaryBuilder.js';
import { readSourceFile } from './SourceFileReader.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import { RulePackLoader } from '../rulepacks/RulePackLoader.js';
import { SecretScrubber } from '../security/SecretScrubber.js';
import { RuleSettings } from '../rulepacks/RuleSettings.js';

// #endregion

/**
 * The commands a workspace can run on all its projects.
 */
const RUN_ALL_COMMANDS: ReadonlyArray<RunAllCommand> = ['detect', 'analyze', 'transform', 'sort', 'generate'];

/**
 * What the reads of a registered project are composed of.
 *
 * @internal
 */
export interface IProjectServiceInit {
    workspaces: WorkspaceService;
    resolver: ConfigurationResolver;
    runs: RunStore;
    fileSystem: IFileSystem;
    home: string;

    /**
     * The environment, whose secret variables stay out of what leaves the app.
     */
    env?: NodeJS.ProcessEnv;
}

/**
 * The reads behind the project views. None of them records a run or writes anything but the last known summary, which
 * lives in the profile.
 *
 * @public
 */
export class ProjectService {

    // #region Fields

    private readonly _init: IProjectServiceInit;
    private readonly _summaries: ProjectSummaryBuilder;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProjectService` class.
     *
     * @param init What the service is composed of.
     */
    public constructor(init: IProjectServiceInit) {
        this._init = init;
        this._summaries = new ProjectSummaryBuilder(init.fileSystem);
    }

    // #endregion

    // #region Methods

    /**
     * Resolves the configuration of a project. A configuration in the repository always wins; only a project without one
     * reads what was chosen at setup, as command arguments.
     *
     * @public
     * @param project The project.
     * @returns The configuration.
     * @throws EngineError when the folder is gone or a configuration file is invalid.
     */
    public resolve(project: ProjectRecord): IResolvedConfiguration {
        if (!existsSync(project.folder)) {
            throw new EngineError('project-folder-missing', `The folder of the project ${project.name} is gone: ${DisplayPath.of(project.folder, this._init.home)}`, [project.folder]);
        }

        const fromRepository = this._init.resolver.resolve({ cwd: project.folder });

        if (fromRepository.configFile || fromRepository.nxTarget || !project.setup) {
            return fromRepository;
        }

        return this._init.resolver.resolve({ cwd: project.folder, arguments: project.setup });
    }

    /**
     * Sums up a project and remembers the result as its last known state.
     *
     * @public
     * @param projectId The project.
     * @returns The summary.
     */
    public summary(projectId: string): ProjectSummary {
        const { project } = this._init.workspaces.requireProject(projectId);
        const summary = this._summaries.build({
            name: project.name,
            folder: project.folder,
            configuration: this.resolve(project),
            lastAnalysis: this.lastAnalysis(project)
        });

        this._init.workspaces.rememberSnapshot(projectId, {
            keyCount: summary.keyCount,
            locales: summary.locales.filter((locale) => locale.file !== null).map((locale) => locale.code)
        });

        return summary;
    }

    /**
     * Lists the projects of a workspace from their last known state. A project that was never looked at is read once, and
     * one that cannot be read shows no figures instead of failing the list.
     *
     * @public
     * @param workspaceId The workspace.
     * @returns Everything the Projects view shows.
     */
    public list(workspaceId: string): ProjectList {
        const workspace = this._init.workspaces.require(workspaceId);
        const runs = this._init.runs.list();

        for (const project of workspace.projects.filter((candidate) => !candidate.snapshot)) {
            try {
                this.summary(project.id);
            } catch {
                // The row below says what is known, and opening the project shows the failure.
            }
        }

        const current = this._init.workspaces.require(workspaceId);
        const rows = current.projects.map((project) => this.projectRow(current, project, runs));
        const nxTarget = current.projects.find((project) => project.nxTarget)?.nxTarget ?? null;

        return {
            workspace: { id: current.id, code: current.code, color: current.color, name: current.name },
            folder: DisplayPath.of(current.repositories[0] ?? '', this._init.home),
            nxTarget,
            totalKeys: rows.reduce((sum, row) => sum + (row.keys ?? 0), 0),
            rows,
            sameAs: nxTarget ? this.printRunAll(current, nxTarget) : null,
            sharedDefaults: nxTarget ? this.readSharedDefaults(current, nxTarget) : null
        };
    }

    /**
     * Returns the settings of a project as Settings: project shows them.
     *
     * @public
     * @param projectId The project.
     * @returns The settings.
     */
    public settings(projectId: string): ProjectSettings {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this.resolve(project);
        const actions = configuration.options.actions;
        const baseLocale = actions?.analyze?.baseLocale ?? 'en';
        const preset = PresetSchema.safeParse(actions?.detect?.preset);
        const roots = configuration.resourceRoots.filter((root) => root.length > 0);

        return {
            name: project.name,
            workingDirectory: DisplayPath.of(project.folder, this._init.home),
            sourceRoot: configuration.root ? DisplayPath.relativeTo(project.folder, configuration.root) : '',
            resourceRoots: roots.map((root) => DisplayPath.relativeTo(project.folder, root)),
            preset: preset.success ? preset.data : null,
            format: (actions?.detect?.type ?? 'json') as ResourceMode,
            prefix: actions?.detect?.resourceKey?.prefix ?? '',
            suffix: actions?.detect?.resourceKey?.suffix ?? '',
            baseLocale,
            targetLocales: this.targetLocales(project, configuration, baseLocale),
            rules: new ResourceAnalyzer(QUIET_LOGGER).ruleNames.map((id) => ({ id, enabled: RuleSettings.severityOf(configuration.options, id) !== 'off' })),
            usedKeys: actions?.analyze?.usedKeys ?? [],
            identicalKeys: actions?.analyze?.identicalKeys ?? [],
            identicalValues: actions?.analyze?.identicalValues ?? []
        };
    }

    /**
     * Returns the effective settings of a project with a source for every value. Tokens stay unresolved and secrets are
     * masked; a file appears as a display path relative to the workspace.
     *
     * @public
     * @param projectId The project.
     * @returns The settings.
     */
    public effectiveSettings(projectId: string): EffectiveSettings {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this.resolve(project);

        return {
            settings: [
                ...configuration.settings.map((setting) => ({
                    ...setting,
                    source: {
                        kind: setting.source.kind,
                        file: setting.source.file ? DisplayPath.relativeTo(configuration.workspaceRoot, setting.source.file) : null
                    }
                })),
                ...this.rulePackSetting(project)
            ],
            warnings: configuration.warnings.map((warning) => DisplayPath.scrub(warning, this._init.home))
        };
    }

    /**
     * Writes the effective settings of projects into a file for a pipeline. A value that is secret stays out with its name, a token
     * such as `{env.NAME}` stays a token, and paths are display values.
     *
     * @public
     * @param projectIds The projects.
     * @param tool What wrote the file.
     * @returns The text of the file.
     */
    public runConfiguration(projectIds: ReadonlyArray<string>, tool: string): string {
        const scrubber = new SecretScrubber();

        for (const [name, value] of Object.entries(this._init.env ?? {})) {
            if (isSecretName(name)) {
                scrubber.add(value);
            }
        }

        const projects = projectIds.map((projectId) => {
            const { project } = this._init.workspaces.requireProject(projectId);
            const { settings } = this.effectiveSettings(projectId);

            return {
                name: project.name,
                settings: settings.filter((setting) => !setting.secret && !isSecretName(setting.key.split('.').at(-1) ?? '')).map((setting) => ({
                    setting: setting.key,
                    value: setting.value,
                    source: setting.source.file ?? setting.source.kind
                }))
            };
        });
        const file = scrubber.sanitize({ format: 'wortlaut-run-configuration', schemaVersion: 1, exportedWith: tool, projects });

        return `${DisplayPath.scrub(JSON.stringify(file, null, 2), this._init.home)}\n`;
    }

    /**
     * Shows the lock file as the source of the rule packs of a project.
     *
     * @private
     */
    private rulePackSetting(project: ProjectRecord): EffectiveSettings['settings'] {
        const { lock, packs } = RulePackLoader.load(project.folder);

        return lock?.exists
            ? [{
                key: 'rulePacks',
                value: packs.map((pack) => `${pack.id}@${pack.entry.commit?.slice(0, 7) ?? pack.entry.version ?? pack.entry.hash.slice(0, 'sha256:'.length + 8)}`),
                secret: false,
                source: { kind: 'lock-file', file: basename(lock.path) }
            }]
            : [];
    }

    /**
     * Returns the file most values of a project come from, with secrets masked.
     *
     * @public
     * @param projectId The project.
     * @returns The file, or none for a project without a file of its own.
     */
    public sourceFile(projectId: string): SettingsSourceFile {
        const { project } = this._init.workspaces.requireProject(projectId);
        const configuration = this.resolve(project);
        const file = this.mainSourceFile(configuration);

        if (!file) {
            return { file: null };
        }

        return { file: { name: DisplayPath.relativeTo(configuration.workspaceRoot, file), ...readSourceFile(file) } };
    }

    /**
     * Returns the absolute path of the file most values of a project come from, for opening it outside of the app.
     *
     * @public
     * @param projectId The project.
     * @returns The path, or `null` for a project without a file of its own.
     */
    public sourceFilePath(projectId: string): string | null {
        const { project } = this._init.workspaces.requireProject(projectId);

        return this.mainSourceFile(this.resolve(project));
    }

    /**
     * Returns the Nx side of a project. Reading it changes nothing in the user's setup.
     *
     * @public
     * @param projectId The project.
     * @returns The targets, commands and scripts.
     */
    public nxTargets(projectId: string): NxTargets {
        const { workspace, project } = this._init.workspaces.requireProject(projectId);
        const configuration = this.resolve(project);
        const target = configuration.nxTarget;
        const runner = this.packageRunner(configuration.workspaceRoot);
        const configPreview = this.previewConfigFile(configuration);

        if (!target) {
            return { executor: null, target: null, projectCount: 0, commands: [], scripts: this.readScripts(configuration.workspaceRoot, null, runner), configPreview };
        }

        const raw = JSON.parse(readFileSync(target.projectFile, 'utf8')) as { name?: string; targets?: Record<string, { executor?: string; configurations?: Record<string, unknown> }> };
        const definition = raw.targets?.[target.targetName];
        const defaults = this.readTargetDefaults(configuration.workspaceRoot, definition?.executor, target.targetName);
        const names = Array.from(new Set([...Object.keys(defaults?.configurations ?? {}), ...Object.keys(definition?.configurations ?? {})]));
        const projectName = raw.name ?? project.name;
        const commands: Array<LabeledCommand> = names.length > 0
            ? names.map((name) => ({ label: `${name[0].toUpperCase()}${name.slice(1)}`, command: `${runner} nx run ${projectName}:${target.targetName}:${name}` }))
            : [{ label: 'Run', command: `${runner} nx run ${projectName}:${target.targetName}` }];

        return {
            executor: definition?.executor ?? null,
            target: target.targetName,
            projectCount: workspace.projects.filter((candidate) => candidate.nxTarget === target.targetName).length,
            commands: [...commands, { label: 'All projects', command: names.includes('analyze') ? CommandPrinter.printRunMany(runner, target.targetName, 'analyze') : `${runner} nx run-many --target=${target.targetName}` }],
            scripts: this.readScripts(configuration.workspaceRoot, target.targetName, runner),
            configPreview
        };
    }

    /**
     * Lists the commands of the CLI, with the settings of a project when one is open.
     *
     * @public
     * @param projectId The project, if one is open.
     * @returns The commands.
     */
    public cliCommands(projectId: string | null): Array<LabeledCommand> {
        if (!projectId) {
            return CommandPrinter.listCommands(null);
        }

        const { project } = this._init.workspaces.requireProject(projectId);

        return CommandPrinter.listCommands(this.resolve(project));
    }

    /**
     * Lists the runs of a project, newest first.
     *
     * @public
     * @param projectId The project, or `null` for the runs of every project of this computer.
     * @param limit The most runs to return.
     * @returns The runs.
     */
    public listRuns(projectId: string | null, limit: number | null): Array<RunSummary> {
        const project = projectId ? this._init.workspaces.requireProject(projectId).project : null;
        const runs = this._init.runs.list().filter((run) => !project || RunProjection.belongsTo(run, project.folder));

        return (limit ? runs.slice(0, limit) : runs).map((run) => RunProjection.summarize(run));
    }

    /**
     * Lists what assistants did, newest first, for Recent activity.
     *
     * @public
     * @param limit The most entries to return.
     * @returns The entries.
     */
    public mcpActivity(limit: number): Array<McpActivity> {
        return this._init.runs.list()
            .flatMap((run) => {
                const activity = RunProjection.activity(run);

                return activity ? [activity] : [];
            })
            .slice(0, limit);
    }

    /**
     * Returns the details of a run.
     *
     * @public
     * @param runId The run.
     * @returns The details, or `null` when the store does not hold it.
     */
    public runDetail(runId: string): RunDetail | null {
        const run = this._init.runs.get(runId);

        return run ? RunProjection.detail(run, this._init.home) : null;
    }

    /**
     * @private
     */
    private lastAnalysis(project: ProjectRecord, runs: ReadonlyArray<RunRecord> = this._init.runs.list()): RunRecord | null {
        return runs.find((run) => run.command === 'analyze' && run.state === 'succeeded' && RunProjection.belongsTo(run, project.folder)) ?? null;
    }

    /**
     * @private
     */
    private projectRow(workspace: WorkspaceRecord, project: ProjectRecord, runs: ReadonlyArray<RunRecord>): ProjectRow {
        return {
            id: project.id,
            name: project.name,
            folder: DisplayPath.relativeTo(workspaceFolderOf(workspace, project.folder), project.folder),
            keys: project.snapshot?.keyCount ?? null,
            locales: project.snapshot?.locales ?? [],
            state: this.projectState(project, runs)
        };
    }

    /**
     * Returns the state badge of a project from its last analysis.
     *
     * @public
     * @param project The project.
     * @param runs The stored runs, newest first.
     * @returns The state.
     */
    public projectState(project: ProjectRecord, runs: ReadonlyArray<RunRecord>): ProjectState {
        if (!existsSync(project.folder)) {
            return { kind: 'folder-missing' };
        }

        const analysis = this.lastAnalysis(project, runs);

        if (!analysis) {
            return { kind: 'not-analyzed' };
        }

        const rules = RunProjection.failedRules(analysis).length;

        return rules > 0 ? { kind: 'failing', rules } : { kind: 'clean' };
    }

    /**
     * @private
     */
    private targetLocales(project: ProjectRecord, configuration: IResolvedConfiguration, baseLocale: string): Array<string> {
        const actions = configuration.options.actions;
        const declared = [...actions?.detect?.languages ?? [], ...actions?.generate?.locales ?? []].filter((locale) => locale !== baseLocale);

        // Locales declared in the configuration win over what the file names say, so a locale that was closed stays closed.
        return Array.from(new Set(declared.length > 0 ? declared : project.snapshot?.locales ?? []))
            .filter((locale) => locale !== baseLocale)
            .sort((a, b) => a.localeCompare(b));
    }

    /**
     * Picks the file that holds most of the values that do not come from the defaults or the setup.
     *
     * @private
     */
    private mainSourceFile(configuration: IResolvedConfiguration): string | null {
        const counts = new Map<string, number>();

        for (const { source } of configuration.settings) {
            if (source.file) {
                counts.set(source.file, (counts.get(source.file) ?? 0) + 1);
            }
        }

        return Array.from(counts.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    }

    /**
     * @private
     */
    private previewConfigFile(configuration: IResolvedConfiguration): string {
        // The keys come from a file of the repository, and the walk below must not reach `Object.prototype`.
        const options = Object.create(null) as Record<string, unknown>;

        for (const setting of configuration.settings) {
            if (setting.source.kind !== 'default' && !setting.secret) {
                const path = setting.key.split('.');
                let target = options;

                for (const segment of path.slice(0, -1)) {
                    target = (target[segment] ??= Object.create(null)) as Record<string, unknown>;
                }

                target[path[path.length - 1]] = setting.value;
            }
        }

        return `${JSON.stringify(options, null, 2)}\n`;
    }

    /**
     * @private
     */
    private packageRunner(workspaceRoot: string): string {
        if (existsSync(join(workspaceRoot, 'yarn.lock'))) {
            return 'yarn';
        }

        if (existsSync(join(workspaceRoot, 'pnpm-lock.yaml'))) {
            return 'pnpm';
        }

        return 'npx';
    }

    /**
     * @private
     */
    private readScripts(workspaceRoot: string, target: string | null, runner: string): Array<LabeledCommand> {
        const manifest = join(workspaceRoot, 'package.json');

        if (!existsSync(manifest)) {
            return [];
        }

        const scripts = (JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {};
        const run = runner === 'npx' ? 'npm run' : runner;

        return Object.entries(scripts)
            .filter(([, script]) => (/wortlaut|localizator/).test(script) || (target !== null && script.includes(target)))
            .map(([name]) => ({ label: name, command: `${run} ${name}` }));
    }

    /**
     * @private
     */
    private printRunAll(workspace: WorkspaceRecord, target: string): Record<RunAllCommand, string> {
        const runner = this.packageRunner(workspace.repositories[0] ?? '');

        return Object.fromEntries(RUN_ALL_COMMANDS.map((command) => [command, CommandPrinter.printRunMany(runner, target, command)])) as Record<RunAllCommand, string>;
    }

    /**
     * @private
     */
    private readTargetDefaults(workspaceRoot: string, executor: string | undefined, target: string): { options?: Record<string, unknown>; configurations?: Record<string, unknown> } | null {
        const nxFile = join(workspaceRoot, 'nx.json');

        if (!existsSync(nxFile)) {
            return null;
        }

        const defaults = (JSON.parse(readFileSync(nxFile, 'utf8')) as { targetDefaults?: Record<string, { options?: Record<string, unknown>; configurations?: Record<string, unknown> }> }).targetDefaults ?? {};

        return (executor ? defaults[executor] : undefined) ?? defaults[target] ?? Object.entries(defaults).find(([name]) => isWortlautExecutor(name))?.[1] ?? null;
    }

    /**
     * Reads the values all projects of an Nx workspace share. It shows them and leaves them as the user's source.
     *
     * @private
     */
    private readSharedDefaults(workspace: WorkspaceRecord, target: string): Array<SharedDefault> | null {
        const defaults = this.readTargetDefaults(workspace.repositories[0] ?? '', undefined, target);
        const actions = defaults?.options?.actions as { detect?: Record<string, unknown>; analyze?: Record<string, Array<unknown>>; transform?: { types?: Array<string> }; sort?: { order?: string }; generate?: { chunkSize?: number; limit?: number | null } } | undefined;

        if (!actions) {
            return null;
        }

        const list = (value: unknown): string => Array.isArray(value) ? value.join(', ') : String(value ?? '');
        const patterns = (value: unknown): string => Array.isArray(value) ? `${value.length} patterns` : '';
        const entries: Array<SharedDefault> = [
            { label: 'Preset', value: list(actions.detect?.preset) },
            { label: 'Locales', value: list(actions.detect?.languages) },
            { label: 'Rules', value: list(actions.analyze?.rules) },
            { label: 'Used keys', value: patterns(actions.analyze?.usedKeys) },
            { label: 'Identical keys', value: patterns(actions.analyze?.identicalKeys) },
            { label: 'Transform', value: list(actions.transform?.types) },
            { label: 'Sort', value: list(actions.sort?.order) },
            { label: 'AI chunks', value: actions.generate?.chunkSize ? `${actions.generate.chunkSize} keys${actions.generate.limit ? `, limit ${actions.generate.limit}` : ''}` : '' }
        ];

        return entries.filter((entry) => entry.value.length > 0);
    }

    // #endregion

}
