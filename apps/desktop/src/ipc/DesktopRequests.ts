// #region Imports

import { arch, cpus, homedir, platform, totalmem } from 'node:os';
import type { IAiProviderHost } from '@pixel-brewery/wortlaut-ai';
import {
  describeMcpClients,
  mcpToolCatalog,
  shellLine,
  type McpLevelStore,
} from '@pixel-brewery/wortlaut-mcp';
import type {
  AiProvider,
  AppSettings,
  AppSettingsView,
  IpcEvent,
  McpStatus,
  ProjectRecord,
  RulePackSourceRequest,
  RulePackWrite,
  RunRecord,
  ShellState,
  WorkspaceRecord,
  WriteOutcome,
} from '@pixel-brewery/wortlaut-contracts';
import type { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import {
  DEFAULT_CACHE_FOLDER,
  DisplayPath,
  EngineError,
  MAX_WORKSPACE_FILE_BYTES,
  PathResolver,
} from '@pixel-brewery/wortlaut-engine';
import { AppSettingsStore } from '../host/AppSettingsStore.js';
import type { FolderGrants } from '../host/FolderGrants.js';
import type { INativeHost } from '../host/INativeHost.js';
import type { IMcpCommand } from '../host/McpConnection.js';
import type { ISecretStore } from '../host/SecretStore.js';
import { RunHost } from '../host/RunHost.js';
import type { IpcHandlers } from './IpcRouter.js';

// #endregion

/**
 * What the requests of the app are composed of.
 *
 * @public
 */
export interface IDesktopRequestsInit {
  engine: WortlautEngine;
  grants: FolderGrants;
  host: INativeHost;
  name: string;
  version: string;

  /**
   * Tells the renderer what happens on its own, such as a run going on.
   */
  publish?: (event: IpcEvent) => void;

  /**
   * Hosts the long runs. It lives outside of the requests, so the app can stop it when it quits.
   */
  runs?: RunHost;

  /**
   * Holds the API keys. Nothing that crosses to the renderer holds one.
   */
  secrets?: ISecretStore;

  /**
   * What the MCP screen reads and sets. The server itself is another process.
   */
  mcp?: IDesktopMcp;

  /**
   * Settings: application. Without a store they live as long as the requests.
   */
  settings?: AppSettingsStore;

  /**
   * The user's home directory, which display paths abbreviate.
   */
  home?: string;
}

/**
 * What the app knows about the MCP server without running it.
 *
 * @public
 */
export interface IDesktopMcp {
  levels: McpLevelStore;
  command: () => IMcpCommand;

  /**
   * Says whether the command line of an assistant is on this computer. It looks at files only.
   */
  isInstalled: (assistant: 'claude' | 'codex') => boolean;
}

/**
 * What the open workspace and project are. This state lives in main, so a reload of the renderer keeps it.
 */
interface ISession {
  workspaceId: string | null;
  projectId: string | null;

  /**
   * Dry run, the visible switch of the title bar. While it is on, nothing reaches a repository: a change set waits in
   * Review. A running run keeps the value it started with.
   */
  dryRun: boolean;
}

/**
 * Creates what answers every request of the renderer. It only translates between tokens and ids on one side and the
 * engine on the other: no engine logic lives here, and no path leaves through it.
 *
 * @public
 * @param init What the requests are composed of.
 * @returns The handlers.
 */
export function createDesktopRequests(init: IDesktopRequestsInit): IpcHandlers {
  const { engine, grants, host } = init;
  const home = init.home ?? homedir();
  const settings = init.settings ?? new AppSettingsStore(null);
  const session: ISession = {
    workspaceId: null,
    projectId: null,
    dryRun: settings.read().startInDryRun,
  };
  const publish = init.publish ?? ((): void => undefined);
  const runs =
    init.runs ??
    new RunHost({
      commands: engine.commands,
      publish,
      projectName: (projectId) => engine.workspaces.requireProject(projectId).project.name,
      hosting: () => runHostingOf(settings.read()),
      scrub: (text) => DisplayPath.scrub(text, home),
    });
  const secrets = init.secrets ?? null;
  const proposals = new Map<string, AbortController>();
  let providerLabel: string | null = null;
  const requireAi = (): IAiProviderHost => {
    if (!engine.ai) {
      throw new EngineError('provider-not-ready', 'This app has no AI providers.');
    }

    return engine.ai;
  };
  const requireSecrets = (): ISecretStore => {
    if (!secrets) {
      throw new EngineError('provider-not-ready', 'This app has no keychain.');
    }

    return secrets;
  };
  const refreshProvider = async (): Promise<void> => {
    const next = await engine.generation.activeProviderLabel().catch(() => providerLabel);

    if (next !== providerLabel) {
      providerLabel = next;
      publish({ type: 'ai.providersChanged' });
    }
  };
  const providerOf = async (providerId: string, refresh = false): Promise<AiProvider> => {
    const provider = (await requireAi().get(providerId, refresh)) as AiProvider;

    void refreshProvider();

    return provider;
  };
  const proposal = async <TResult>(
    requestId: string,
    work: (signal: AbortSignal) => Promise<TResult>,
  ): Promise<TResult> => {
    const controller = new AbortController();

    proposals.set(requestId, controller);

    try {
      return await work(controller.signal);
    } finally {
      proposals.delete(requestId);
    }
  };
  const announce = (outcome: WriteOutcome): WriteOutcome => {
    if (outcome.state !== 'unchanged') {
      publish({ type: 'changes.updated' });
    }

    return outcome;
  };

  const requireMcp = (): IDesktopMcp => {
    if (!init.mcp) {
      throw new EngineError('invalid-arguments', 'This app has no MCP settings.');
    }

    return init.mcp;
  };
  const mcpStatus = (): McpStatus => {
    const mcp = requireMcp();
    const { command, ready, problem } = mcp.command();

    return { level: mcp.levels.read() ?? 'read', command: shellLine(command), ready, problem };
  };

  const settingsView = (values: AppSettings): AppSettingsView => ({
    ...values,
    cacheFolder: DEFAULT_CACHE_FOLDER,
    activeColorMode: host.activeColorMode(),
  });
  const savedFile = (file: string | null): { file: string | null } => ({
    file: file ? DisplayPath.of(file, home) : null,
  });
  const announcePack = (write: RulePackWrite): RulePackWrite => {
    if (write.results.some((result) => result.outcome && result.outcome.state !== 'unchanged')) {
      publish({ type: 'changes.updated' });
    }

    return write;
  };

  const shellState = (): ShellState => {
    const workspace = currentWorkspace(engine, session);
    const project =
      workspace?.projects.find((candidate) => candidate.id === session.projectId) ?? null;

    return {
      workspace: workspace ? engine.workspaces.refOf(workspace) : null,
      project: project ? { id: project.id, name: project.name } : null,
      provider: providerLabel,
      dryRun: session.dryRun,
      pendingChanges: workspace ? engine.review.count(workspace.id) : 0,
    };
  };

  engine.generation.guardPaths((path) => requireInsideRoots(engine, path));
  engine.rulePacks.guardPaths((path) => requireInsideRoots(engine, path));
  engine.generation.subscribe((runId) => publish({ type: 'generate.updated', runId }));
  engine.translationLab.subscribe((id) => publish({ type: 'test.translationUpdated', id }));
  void refreshProvider();

  return {
    'app.githubTokenStatus': () => ({ configured: requireSecrets().has('github') }),
    'app.setGithubToken': ({ token }) => {
      const store = requireSecrets();

      if (token === null) {
        store.clear('github');
      } else {
        store.set('github', token);
      }

      return { configured: store.has('github') };
    },
    'app.getInfo': () => ({
      name: init.name,
      version: init.version,
      platform: platform(),
      arch: arch(),
      cpus: cpus().length,
      totalMemory: totalmem(),
    }),
    'app.getSettings': () => settingsView(settings.read()),
    'app.saveSettings': (values) => {
      settings.write(values);
      host.setColorMode(values.colorMode);

      return settingsView(values);
    },
    'search.query': ({ text, workspaceId, projectId }) =>
      engine.search.query(workspaceId, projectId, text),
    'search.openFile': async ({ id }) => {
      const path = engine.search.pathOf(id);

      requireInsideRoots(engine, path);
      await host.openPath(path);

      return {};
    },
    'shell.state': shellState,
    'shell.setProject': ({ projectId }) => {
      if (projectId) {
        session.workspaceId = engine.workspaces.requireProject(projectId).workspace.id;
      }

      session.projectId = projectId;

      return shellState();
    },
    'clipboard.writeText': async ({ text }) => {
      await host.writeClipboard(text);

      return {};
    },
    'dialog.chooseFolder': async ({ insideToken, insideProjectId }) => {
      const path = await host.chooseFolder();

      if (!path) {
        return { folder: null };
      }

      const folder = grants.grant(path, insideToken);

      if (insideProjectId) {
        requireInside(
          engine.workspaces.requireProject(insideProjectId).project,
          grants.resolve(folder.token),
        );
      }

      return { folder };
    },
    'ai.providers': async () => {
      const providers = await engine.generation.providers();

      void refreshProvider();

      return providers;
    },
    'ai.checkLogin': ({ providerId }) => providerOf(providerId, true),
    'ai.installHint': ({ providerId }) => ({ text: requireAi().installHint(providerId) }),
    'ai.setKey': ({ providerId, key }) => {
      requireSecrets().set(providerId, key);

      return providerOf(providerId);
    },
    'ai.clearKey': ({ providerId }) => {
      requireSecrets().clear(providerId);

      return providerOf(providerId);
    },
    'ai.testKey': ({ providerId }) => requireAi().testKey(providerId),
    'ai.models': async ({ providerId }) => ({ models: await requireAi().models(providerId) }),
    'ai.defaults': ({ projectId }) => engine.generation.defaults(projectId),
    'ai.saveDefaults': async ({ projectId, changes }) =>
      announce(await engine.commands.saveAiDefaults(projectId, changes, session.dryRun)),
    'ai.setDefaultProvider': async ({ providerId }) => {
      engine.aiPreferences.defaultProvider = providerId;
      await refreshProvider();

      return shellState();
    },
    'ai.suggestValue': ({ requestId, projectId, key, locale, comment }) =>
      proposal(requestId, (signal) =>
        engine.generation.suggestValue(projectId, { key, locale, comment }, signal),
      ),
    'ai.nameKeys': ({ requestId, projectId, scanId, rowIds }) =>
      proposal(requestId, (signal) => engine.commands.nameKeys(projectId, scanId, rowIds, signal)),
    'ai.suggestPatterns': ({ requestId, projectId, keys }) =>
      proposal(requestId, (signal) => engine.generation.suggestPatterns(projectId, keys, signal)),
    'ai.cancel': ({ requestId }) => {
      proposals.get(requestId)?.abort();

      return {};
    },
    'generate.overview': ({ projectId }) => engine.generation.overview(projectId),
    'generate.estimate': ({ projectId, input }) => engine.generation.estimate(projectId, input),
    'generate.prompt': ({ projectId, input }) => ({
      text: engine.generation.prompt(projectId, input),
    }),
    'generate.command': ({ projectId, input }) => engine.generation.command(projectId, input),
    'generate.addLocale': async ({ projectId, locale }) =>
      announce(await engine.commands.addTargetLocale(projectId, locale, session.dryRun)),
    'generate.get': ({ runId, locale }) => engine.generation.get(runId, locale),
    'generate.pause': ({ runId }) => {
      engine.generation.pause(runId);

      return {};
    },
    'generate.resume': ({ runId }) => {
      engine.generation.resume(runId);

      return {};
    },
    'generate.stop': ({ runId }) => {
      engine.generation.stop(runId);

      return {};
    },
    'generate.again': ({ runId }) => {
      const { projectId, input } = engine.generation.setupOf(runId);

      return runs.start({ command: 'generate', projectId, input }, session.dryRun);
    },
    'generate.setRow': ({ runId, locale, key, value, accepted }) =>
      engine.generation.setRow(runId, locale, key, { value, accepted }),
    'generate.write': async ({ runId, locale }) =>
      announce(await engine.commands.writeGenerated(runId, locale, session.dryRun)),
    'test.sample': ({ projectId, namespace, size }) => {
      const overview = engine.generation.overview(projectId);

      return {
        baseLocale: overview.baseLocale,
        locales: overview.targets.map((target) => target.locale),
        namespaces: overview.namespaces,
        rows: engine.catalogs.sample(projectId, namespace, size),
        instructions: overview.defaults.instructions,
      };
    },
    'test.translate': (request) => {
      const { format, baseLocale } = engine.catalogs.translationOverview(request.projectId);

      return engine.translationLab.start(request, format, baseLocale);
    },
    'test.translation': ({ id }) => engine.translationLab.get(id),
    'test.cancelTranslation': ({ id }) => {
      engine.translationLab.cancel(id);

      return {};
    },
    'workspace.recent': () => engine.workspaces.recent(),
    'workspace.list': () => {
      const runs = engine.runs.list();

      return engine.workspaces.list((project) => isFailing(engine, project, runs));
    },
    'workspace.get': ({ workspaceId }) => ({
      ...engine.workspaces.detail(workspaceId),
      rulePackCount: engine.rulePacks.enabledCount(workspaceId),
    }),
    'workspace.create': ({ name, code, color, folderToken }) => {
      const created = engine.workspaces.create({
        name,
        code,
        color,
        repository: grants.resolve(folderToken),
      });

      session.workspaceId = created.workspaceId;
      session.projectId = null;

      return created;
    },
    'workspace.open': ({ workspaceId }) => {
      const { projects } = engine.workspaces.open(workspaceId);

      session.workspaceId = workspaceId;
      session.projectId = projects.length === 1 ? projects[0].id : null;

      return { next: projects.length === 1 ? 'overview' : 'projects' };
    },
    'project.inspectFolder': ({ folderToken, catalogFolderTokens, preset, sourceRootToken }) =>
      engine.inspector.inspect(
        grants.resolve(folderToken),
        catalogFolderTokens.map((token) => grants.resolveInside(token, folderToken)),
        preset,
        sourceRootToken ? grants.resolveInside(sourceRootToken, folderToken) : null,
      ).inspection,
    'project.register': async ({
      folderToken,
      catalogFolderTokens,
      workspace,
      preset,
      baseLocale,
      targetLocales,
      sourceRootToken,
    }) => {
      const inspection = engine.inspector.inspect(
        grants.resolve(folderToken),
        catalogFolderTokens.map((token) => grants.resolveInside(token, folderToken)),
        preset,
        sourceRootToken ? grants.resolveInside(sourceRootToken, folderToken) : null,
      );
      const registered = engine.workspaces.register({
        inspection,
        workspace,
        preset,
        baseLocale,
        targetLocales,
      });

      engine.workspaces.open(registered.workspaceId);
      session.workspaceId = registered.workspaceId;
      session.projectId = registered.projectId;

      const { project } = engine.workspaces.requireProject(registered.projectId);
      const written = await engine.commands.writeSetupConfiguration(project, session.dryRun);

      if (written) {
        announce(written);
      }

      return {
        ...registered,
        configFile: written ? (written.state === 'applied' ? 'written' : 'pending') : null,
      };
    },
    'project.list': ({ workspaceId }) => engine.projects.list(workspaceId),
    'project.summary': ({ projectId }) => engine.projects.summary(projectId),
    'project.settings': ({ projectId }) => engine.projects.settings(projectId),
    'config.getEffective': ({ projectId }) => engine.projects.effectiveSettings(projectId),
    'config.getSourceFile': ({ projectId }) => engine.projects.sourceFile(projectId),
    'config.openSourceFile': async ({ projectId }) => {
      const path = engine.projects.sourceFilePath(projectId);

      if (!path) {
        throw new EngineError('invalid-arguments', 'This project has no settings file yet.');
      }

      await host.openPath(path);

      return {};
    },
    'config.exportRun': async ({ workspaceId, projectId }) => {
      const projects = projectId
        ? [projectId]
        : engine.workspaces.require(workspaceId).projects.map((project) => project.id);

      if (projects.length === 0) {
        throw new EngineError('invalid-arguments', 'This workspace has no project to export.');
      }

      return savedFile(
        await host.saveTextFile({
          title: 'Export run configuration',
          defaultName: 'wortlaut-run-configuration.json',
          text: engine.projects.runConfiguration(projects, `${init.name} ${init.version}`),
        }),
      );
    },
    'nx.targets': ({ projectId }) => engine.projects.nxTargets(projectId),
    'cli.commands': ({ projectId }) => engine.projects.cliCommands(projectId),
    'mcp.status': mcpStatus,
    'mcp.setLevel': ({ level }) => {
      requireMcp().levels.write(level);

      return mcpStatus();
    },
    'mcp.clients': () => {
      const mcp = requireMcp();
      const seen = new Set(
        engine.projects.mcpActivity(Number.MAX_SAFE_INTEGER).map((entry) => entry.client),
      );

      return describeMcpClients(mcp.command(), {
        'claude-code': {
          isInstalled: mcp.isInstalled('claude'),
          hasConnected: seen.has('Claude Code'),
        },
        codex: { isInstalled: mcp.isInstalled('codex'), hasConnected: seen.has('Codex') },
      });
    },
    'mcp.tools': () => mcpToolCatalog(),
    'mcp.activity': ({ limit }) => engine.projects.mcpActivity(limit),
    'run.list': ({ projectId, limit }) => engine.projects.listRuns(projectId, limit),
    'run.get': ({ runId }) => {
      const run = engine.projects.runDetail(runId);

      if (!run) {
        throw new EngineError('invalid-arguments', 'This run is no longer stored.');
      }

      return run;
    },
    'app.setDryRun': ({ dryRun }) => {
      session.dryRun = dryRun;

      return shellState();
    },
    'run.start': (request) => runs.start(request, session.dryRun),
    'run.startAll': ({ workspaceId, command }) =>
      runs.startAll(
        workspaceId,
        engine.workspaces.require(workspaceId).projects.map((project) => project.id),
        command,
        session.dryRun,
      ),
    'run.batch': ({ workspaceId }) => runs.batchOf(workspaceId),
    'run.cancelBatch': ({ batchId }) => {
      runs.cancelBatch(batchId);

      return {};
    },
    'run.cancel': ({ runId }) => {
      runs.cancel(runId);

      return {};
    },
    'run.repeat': ({ runId }) => {
      const record = engine.runs.get(runId);

      if (!record) {
        throw new EngineError('invalid-arguments', 'This run is no longer stored.');
      }

      return runs.repeat(record, projectIdOfRun(engine, session, record), session.dryRun);
    },
    'run.active': () => runs.active(),
    'run.result': ({ runId }) => runs.result(runId),
    'run.latest': ({ projectId, command }) => runs.latest(projectId, command),
    'run.print': (request) => ({ command: engine.commands.print(request) }),
    'detect.settings': ({ projectId }) => engine.commands.detectSettings(projectId),
    'detect.apply': async (request) =>
      announce(await engine.commands.applyDetect(request, session.dryRun)),
    'analyze.overview': ({ projectId }) => engine.commands.analyzeOverview(projectId),
    'transform.overview': ({ projectId }) => engine.commands.transformOverview(projectId),
    'config.exceptions': ({ projectId }) => engine.commands.exceptions(projectId),
    'config.addException': async ({ projectId, list, entry }) =>
      announce(await engine.commands.addException(projectId, list, entry, session.dryRun)),
    'config.addRuleException': async ({ projectId, rule, key }) =>
      announce(await engine.commands.addRuleException(projectId, rule, key, session.dryRun)),
    'rulePack.check': async ({ source }) => {
      const open = { workspaceId: session.workspaceId, projectId: session.projectId };

      return source.kind === 'folder'
        ? await engine.rulePacks.check(
            { kind: 'folder', path: grants.resolve(source.folderToken) },
            open,
          )
        : await engine.rulePacks.checkText(packTextOf(source), open);
    },
    'rulePack.install': async ({ checkId, target }) =>
      announcePack(await engine.rulePacks.installTo(checkId, target, session.dryRun)),
    'rulePack.list': ({ workspaceId }) => engine.rulePacks.list(workspaceId),
    'rulePack.available': ({ workspaceId }) => engine.rulePacks.available(workspaceId),
    'rulePack.setEnabled': async ({ workspaceId, packId, enabled }) =>
      announcePack(
        await engine.rulePacks.setEnabledIn(workspaceId, packId, enabled, session.dryRun),
      ),
    'rulePack.setSeverity': async ({ workspaceId, ruleId, severity }) =>
      announcePack(
        await engine.rulePacks.setSeverityIn(workspaceId, ruleId, severity, session.dryRun),
      ),
    'rulePack.checkUpdate': ({ workspaceId, packId }) =>
      engine.rulePacks.checkUpdate(workspaceId, packId),
    'rulePack.update': async ({ workspaceId, updateId }) =>
      announcePack(await engine.rulePacks.updateIn(workspaceId, updateId, session.dryRun)),
    'config.update': async ({ projectId, changes }) => {
      const { project } = engine.workspaces.requireProject(projectId);
      const inside = (token: string): string => {
        const folder = grants.resolve(token);

        requireInside(project, folder);

        return folder;
      };

      return announce(
        await engine.commands.updateSettings(
          projectId,
          changes,
          {
            sourceRoot: changes.sourceRootToken ? inside(changes.sourceRootToken) : null,
            addResourceRoots: (changes.addResourceRootTokens ?? []).map(inside),
          },
          session.dryRun,
        ),
      );
    },
    'catalog.overview': ({ projectId, refresh }) => engine.catalogs.overview(projectId, refresh),
    'catalog.keys': (request) => engine.catalogs.keys(request),
    'catalog.keyDetail': ({ projectId, key, targetLocale }) =>
      engine.catalogs.keyDetail(projectId, key, targetLocale),
    'catalog.setValue': async ({ projectId, key, locale, value }) =>
      announce(
        await engine.commands.editCatalog(
          projectId,
          { kind: 'set-value', key, locale, value },
          session.dryRun,
        ),
      ),
    'catalog.setComment': async ({ projectId, key, locale, comment }) =>
      announce(
        await engine.commands.editCatalog(
          projectId,
          { kind: 'set-comment', key, locale, comment },
          session.dryRun,
        ),
      ),
    'catalog.deleteKey': async ({ projectId, key }) =>
      announce(
        await engine.commands.editCatalog(projectId, { kind: 'delete-key', key }, session.dryRun),
      ),
    'catalog.mergeKeys': async ({ projectId, keep, remove }) =>
      announce(
        await engine.commands.editCatalog(
          projectId,
          { kind: 'merge-keys', keep, remove },
          session.dryRun,
        ),
      ),
    'catalog.addLocale': async ({ projectId, locale }) =>
      announce(
        await engine.commands.editCatalog(
          projectId,
          { kind: 'add-locale', locale },
          session.dryRun,
        ),
      ),
    'catalog.openFile': async ({ projectId, locale }) => {
      const path = engine.catalogs.catalogPath(projectId, locale);

      requireInsideRoots(engine, path);
      await host.openPath(path);

      return {};
    },
    'test.presets': ({ projectId }) =>
      engine.testLab.testPresets(projectId ? engine.projects.settings(projectId).prefix : ''),
    'test.detect': ({ projectId, preset, fileName, content }) =>
      engine.testLab.detect(
        preset,
        fileName,
        content,
        projectId ? engine.projects.settings(projectId).prefix : '',
      ),
    'test.pattern': ({ projectId, pattern, list }) =>
      engine.testLab.pattern(pattern, list, engine.catalogs.allKeys(projectId)),
    'changes.list': ({ workspaceId }) => engine.review.list(workspaceId),
    'changes.get': ({ id, fileOffset, fileLimit }) =>
      engine.review.detail(id, { fileOffset, fileLimit }),
    'changes.apply': async ({ id }) => {
      if (session.dryRun) {
        throw new EngineError(
          'invalid-arguments',
          'Dry run is on, so nothing is written. Turn it off in the title bar to apply this change set.',
        );
      }

      const changeSet = engine.getChangeSet(id);

      for (const file of changeSet.files) {
        requireInsideRoots(engine, file.path);
      }

      const outcome = await engine.applyChangeSet(id, changeSet.cwd);

      for (const workspace of engine.workspaces.all()) {
        for (const project of workspace.projects) {
          engine.catalogs.invalidate(project.id);
        }
      }

      publish({ type: 'changes.updated' });

      return {
        state: 'applied',
        changeSetId: id,
        runId: outcome.report.runId,
        files: outcome.changeSet?.files.map((file) => file.displayPath) ?? [],
      };
    },
    'changes.discard': async ({ id }) => {
      await engine.discardChangeSet(id, engine.getChangeSet(id).cwd);
      publish({ type: 'changes.updated' });

      return {};
    },
    'changes.recovered': () =>
      engine.recovered.map(({ outcome, message }) => ({
        outcome,
        message: DisplayPath.scrub(message, home),
      })),
    'workspace.update': ({
      workspaceId,
      name,
      code,
      color,
      scanForProjects,
      defaults,
      removeRepositories,
      addRepositoryTokens,
    }) => ({
      ...engine.workspaces.update(workspaceId, {
        name,
        code,
        color,
        scanForProjects,
        defaults,
        removeRepositories,
        addRepositories: addRepositoryTokens.map((token) => grants.resolve(token)),
      }),
      rulePackCount: engine.rulePacks.enabledCount(workspaceId),
    }),
    'workspace.remove': ({ workspaceId }) => {
      engine.workspaces.remove(workspaceId);

      if (session.workspaceId === workspaceId) {
        session.workspaceId = null;
        session.projectId = null;
      }

      return {};
    },
    'workspace.export': async ({ workspaceId }) => {
      const { name } = engine.workspaces.require(workspaceId);

      return savedFile(
        await host.saveTextFile({
          title: 'Export workspace',
          defaultName: `${fileNameOf(name)}.wortlaut-workspace.json`,
          text: engine.transfer.exportText(workspaceId),
        }),
      );
    },
    'workspace.chooseImport': async () => {
      const file = await host.openTextFile({
        title: 'Import workspace',
        maxBytes: MAX_WORKSPACE_FILE_BYTES,
      });

      return { preview: file ? engine.transfer.preview(file.text, file.name) : null };
    },
    'workspace.import': async ({ importId, folderTokens }) => {
      const result = await engine.transfer.add(
        importId,
        folderTokens.map((token) => grants.resolve(token)),
        session.dryRun,
      );

      if (result.packs.some((pack) => pack.state === 'pending' || pack.state === 'written')) {
        publish({ type: 'changes.updated' });
      }

      return result;
    },
  };
}

/**
 * What every run gets from Settings: application. The folder of the cache is relative to the working directory of the run.
 *
 * @public
 * @param settings The settings.
 * @returns What a run host passes on.
 */
export function runHostingOf(settings: AppSettings): {
  cache?: { folder: string };
  verbose: boolean;
} {
  return {
    ...(settings.cacheResults ? { cache: { folder: DEFAULT_CACHE_FOLDER } } : {}),
    verbose: settings.verboseLog,
  };
}

/**
 * Turns the name of a workspace into a file name.
 *
 * @private
 */
function fileNameOf(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'workspace';
}

/**
 * Turns a folder dropped on the app into what the renderer may know: a token, or a message.
 *
 * @public
 * @param grants The folder grants.
 * @param raw What the preload sent.
 * @returns The event for the renderer.
 */
export function describeFolderDrop(grants: FolderGrants, raw: unknown): IpcEvent {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) {
    return { type: 'folder.dropFailed', message: 'That is no folder. Drop a folder.' };
  }

  try {
    return { type: 'folder.dropped', folder: grants.grant(raw) };
  } catch (error) {
    return {
      type: 'folder.dropFailed',
      message: error instanceof Error ? error.message : 'This folder cannot be read.',
    };
  }
}

/**
 * Writes the source a renderer names as text. Its kind decides the prefix, so text can name a repository, a package or a pack of
 * Wortlaut, and never a path: a folder is only ever a token of a native dialog.
 *
 * @private
 */
function packTextOf(source: Exclude<RulePackSourceRequest, { kind: 'folder' }>): string {
  const prefix = source.kind === 'shipped' ? 'wortlaut' : source.kind;

  return source.value.startsWith(`${prefix}:`) ? source.value : `${prefix}:${source.value}`;
}

/**
 * Refuses a folder outside of a project.
 *
 * @private
 */
function requireInside(project: ProjectRecord, folder: string): void {
  if (!PathResolver.isInside(project.folder, folder)) {
    throw new Error('Choose a folder inside the project.');
  }
}

/**
 * Refuses a path outside of every folder the user chose for a workspace.
 *
 * @private
 */
function requireInsideRoots(engine: WortlautEngine, path: string): void {
  engine.workspaces.requireInsideKnownRoots(path);
}

/**
 * Finds the project of a stored run: the open one when the run belongs to it, otherwise the one whose folder holds it.
 *
 * @private
 */
function projectIdOfRun(engine: WortlautEngine, session: ISession, record: RunRecord): string {
  const projects = engine.workspaces.all().flatMap((workspace) => workspace.projects);
  const project =
    projects.find(
      (candidate) =>
        candidate.id === session.projectId && PathResolver.isInside(candidate.folder, record.cwd),
    ) ?? projects.find((candidate) => PathResolver.isInside(candidate.folder, record.cwd));

  if (!project) {
    throw new EngineError('project-not-found', 'No project of this profile holds that run.');
  }

  return project.id;
}

/**
 * @private
 */
function currentWorkspace(engine: WortlautEngine, session: ISession): WorkspaceRecord | null {
  if (!session.workspaceId) {
    return null;
  }

  try {
    return engine.workspaces.require(session.workspaceId);
  } catch {
    return null;
  }
}

/**
 * @private
 */
function isFailing(
  engine: WortlautEngine,
  project: ProjectRecord,
  runs: ReadonlyArray<RunRecord>,
): boolean {
  const state = engine.projects.projectState(project, runs);

  return state.kind === 'failing' || state.kind === 'folder-missing';
}
