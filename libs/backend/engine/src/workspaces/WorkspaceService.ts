// #region Imports

import { existsSync } from 'node:fs';
import type {
  ProjectRecord,
  ProjectRegisterResult,
  ProjectSnapshot,
  WorkspaceCard,
  WorkspaceColor,
  WorkspaceCreateResult,
  WorkspaceDefaults,
  WorkspaceDetail,
  WorkspaceRecent,
  WorkspaceRecord,
  WorkspaceRef,
} from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { createSortableId } from '../io/AtomicFile.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { discoverProjects } from '../projects/ProjectDiscovery.js';
import type { IProjectInspectionResult, ProjectInspector } from '../projects/ProjectInspector.js';
import type { WorkspaceStore } from './WorkspaceStore.js';

// #endregion

/**
 * The most workspaces the recent list shows.
 */
const MAX_RECENT = 5;

/**
 * What a new workspace is made of.
 *
 * @public
 */
export interface IWorkspaceCreation {
  name: string;
  code: string;
  color: WorkspaceColor;

  /**
   * The absolute path of the repository the user chose.
   */
  repository: string;
}

/**
 * The choices of Project setup.
 *
 * @public
 */
export interface IProjectRegistration {
  inspection: IProjectInspectionResult;
  workspace:
    | { kind: 'existing'; id: string }
    | { kind: 'new'; name: string; code: string; color: WorkspaceColor };
  preset: string | null;
  baseLocale: string;
  targetLocales: ReadonlyArray<string>;
}

/**
 * What Settings: workspace changes.
 *
 * @public
 */
export interface IWorkspaceChange {
  name: string;
  code: string;
  color: WorkspaceColor;
  scanForProjects: boolean;
  defaults: WorkspaceDefaults;
  removeRepositories: ReadonlyArray<number>;
  addRepositories: ReadonlyArray<string>;
}

/**
 * The workspaces and registered projects of the user's profile. Registering writes only to the profile, never to a
 * repository: a project without a configuration of its own keeps its setup choices there until a later change set puts
 * them into its repository.
 *
 * @public
 */
export class WorkspaceService {
  // #region Fields

  private readonly _store: WorkspaceStore;
  private readonly _inspector: ProjectInspector;
  private readonly _home: string;
  private readonly _now: () => Date;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `WorkspaceService` class.
   *
   * @param store The store.
   * @param inspector The inspector, for the choices of a setup.
   * @param home The home directory, for display paths.
   * @param now The clock.
   */
  public constructor(
    store: WorkspaceStore,
    inspector: ProjectInspector,
    home: string,
    now: () => Date,
  ) {
    this._store = store;
    this._inspector = inspector;
    this._home = home;
    this._now = now;
  }

  // #endregion

  // #region Methods

  /**
   * Returns the most recently opened workspaces from the last known state. It scans nothing.
   *
   * @public
   * @returns The workspaces, latest first.
   */
  public recent(): Array<WorkspaceRecent> {
    return this._store
      .read()
      .sort((a, b) => (b.openedAt ?? b.createdAt).localeCompare(a.openedAt ?? a.createdAt))
      .slice(0, MAX_RECENT)
      .map((workspace) => this.recentOf(workspace));
  }

  /**
   * Returns all workspaces as cards, from the last known state.
   *
   * @public
   * @param failing Says whether a project needs attention.
   * @returns The cards, oldest first.
   */
  public list(failing: (project: ProjectRecord) => boolean = () => false): Array<WorkspaceCard> {
    return this._store.read().map((workspace) => ({
      ...this.recentOf(workspace),
      folder: DisplayPath.of(workspace.repositories[0] ?? '', this._home),
      nxTarget: workspace.projects.find((project) => project.nxTarget)?.nxTarget ?? null,
      provider: null,
      failingProjects: workspace.projects.filter((project) => failing(project)).length,
    }));
  }

  /**
   * Returns all stored workspaces.
   *
   * @public
   * @returns The workspaces.
   */
  public all(): Array<WorkspaceRecord> {
    return this._store.read();
  }

  /**
   * Returns a stored workspace.
   *
   * @public
   * @param id The workspace.
   * @returns The workspace.
   * @throws EngineError when the profile does not hold it.
   */
  public require(id: string): WorkspaceRecord {
    const workspace = this._store.read().find((candidate) => candidate.id === id);

    if (!workspace) {
      throw new EngineError('workspace-not-found', 'This workspace no longer exists.');
    }

    return workspace;
  }

  /**
   * Returns a stored project with its workspace.
   *
   * @public
   * @param id The project.
   * @returns The project and its workspace.
   * @throws EngineError when the profile does not hold it.
   */
  public requireProject(id: string): { workspace: WorkspaceRecord; project: ProjectRecord } {
    for (const workspace of this._store.read()) {
      const project = workspace.projects.find((candidate) => candidate.id === id);

      if (project) {
        return { workspace, project };
      }
    }

    throw new EngineError('project-not-found', 'This project no longer exists.');
  }

  /**
   * Refuses a path outside of every folder the user chose for a workspace. It compares where they really are, so a link
   * inside a project does not lead out of it.
   *
   * @public
   * @param path The path.
   * @throws EngineError `outside-known-roots`, which names no path.
   */
  public requireInsideKnownRoots(path: string): void {
    const roots = this.all().flatMap((workspace) => [
      ...workspace.repositories,
      ...workspace.projects.map((project) => project.folder),
    ]);
    const real = PathResolver.realPathOf(path);

    if (!roots.some((root) => PathResolver.isInside(PathResolver.realPathOf(root), real))) {
      throw new EngineError(
        'outside-known-roots',
        'This file lies outside of the folders you chose, so Wortlaut leaves it alone.',
      );
    }
  }

  /**
   * Returns what Settings: workspace shows.
   *
   * @public
   * @param id The workspace.
   * @returns The details.
   */
  public detail(id: string): WorkspaceDetail {
    const workspace = this.require(id);

    return {
      ...this.refOf(workspace),
      repositories: workspace.repositories.map((repository) => ({
        displayPath: DisplayPath.of(repository, this._home),
        missing: !existsSync(repository),
      })),
      scanForProjects: workspace.scanForProjects,
      defaults: { ...workspace.defaults, provider: null },
      rulePackCount: 0,
    };
  }

  /**
   * Creates a workspace and registers the projects its repository brings along. Projects without a configuration of
   * their own go through Project setup.
   *
   * @public
   * @param creation The workspace.
   * @returns The workspace and where to continue.
   */
  public create(creation: IWorkspaceCreation): WorkspaceCreateResult {
    const now = this._now();
    const discovered = discoverProjects(creation.repository);
    const workspace: WorkspaceRecord = {
      id: createSortableId(now),
      name: creation.name,
      code: creation.code,
      color: creation.color,
      repositories: [creation.repository],
      scanForProjects: true,
      defaults: { baseLocale: null, targetLocales: [], preset: null },
      projects: discovered.map((project) => ({
        id: createSortableId(now),
        name: project.name,
        folder: project.folder,
        kind: project.kind,
        nxTarget: project.nxTarget,
        setup: null,
        snapshot: null,
        addedAt: now.toISOString(),
      })),
      createdAt: now.toISOString(),
      openedAt: now.toISOString(),
    };

    this._store.update((workspaces) => [...workspaces, workspace]);

    return {
      workspaceId: workspace.id,
      discovered: discovered.length,
      next: discovered.length > 0 ? 'projects' : 'setup',
    };
  }

  /**
   * Adds a workspace from a file, with the folders the user chose for it. What the folders hold comes from the scan, when the file
   * wants one.
   *
   * @public
   * @param adoption The values of the file and the chosen folders.
   * @returns The workspace and how many projects the scan found.
   */
  public adopt(
    adoption: Pick<WorkspaceRecord, 'name' | 'code' | 'color' | 'scanForProjects' | 'defaults'> & {
      repositories: ReadonlyArray<string>;
    },
  ): { workspaceId: string; discovered: number } {
    const now = this._now();
    const repositories = Array.from(new Set(adoption.repositories));
    const discovered = adoption.scanForProjects
      ? repositories.flatMap((repository) => discoverProjects(repository))
      : [];
    const workspace: WorkspaceRecord = {
      id: createSortableId(now),
      name: adoption.name,
      code: adoption.code,
      color: adoption.color,
      repositories,
      scanForProjects: adoption.scanForProjects,
      defaults: adoption.defaults,
      projects: discovered.map((project) => ({
        id: createSortableId(now),
        name: project.name,
        folder: project.folder,
        kind: project.kind,
        nxTarget: project.nxTarget,
        setup: null,
        snapshot: null,
        addedAt: now.toISOString(),
      })),
      createdAt: now.toISOString(),
      openedAt: null,
    };

    this._store.update((workspaces) => [...workspaces, workspace]);

    return { workspaceId: workspace.id, discovered: discovered.length };
  }

  /**
   * Registers a project after Project setup. A folder that a workspace already holds is updated, not added again.
   *
   * @public
   * @param registration The choices.
   * @returns The workspace and the project.
   */
  public register(registration: IProjectRegistration): Omit<ProjectRegisterResult, 'configFile'> {
    const now = this._now();
    const { inspection } = registration;
    const configuration = inspection.inspection.configuration;
    const kind = configuration
      ? configuration.kind === 'nx-target'
        ? 'nx-target'
        : 'configuration'
      : 'setup';
    const setup =
      kind === 'setup'
        ? this._inspector.buildSetupOptions(
            inspection,
            registration.preset,
            registration.baseLocale,
            registration.targetLocales,
          )
        : null;
    const projectId = createSortableId(now);
    const fresh: ProjectRecord = {
      id: projectId,
      name: inspection.inspection.name,
      folder: inspection.folder,
      kind,
      nxTarget: inspection.configuration.nxTarget?.targetName ?? null,
      setup,
      snapshot: null,
      addedAt: now.toISOString(),
    };
    const defaults: WorkspaceDefaults = {
      baseLocale: registration.baseLocale,
      targetLocales: [...registration.targetLocales],
      preset: inspection.inspection.preset.value,
    };
    let result = { workspaceId: '', projectId };

    this._store.update((workspaces) => {
      if (registration.workspace.kind === 'new') {
        const workspace: WorkspaceRecord = {
          id: createSortableId(now),
          name: registration.workspace.name,
          code: registration.workspace.code,
          color: registration.workspace.color,
          repositories: [inspection.folder],
          scanForProjects: true,
          defaults,
          projects: [fresh],
          createdAt: now.toISOString(),
          openedAt: now.toISOString(),
        };

        result = { workspaceId: workspace.id, projectId };

        return [...workspaces, workspace];
      }

      const target = registration.workspace.id;

      if (!workspaces.some((workspace) => workspace.id === target)) {
        throw new EngineError('workspace-not-found', 'This workspace no longer exists.');
      }

      return workspaces.map((workspace) => {
        if (workspace.id !== target) {
          return workspace;
        }

        const existing = workspace.projects.find((project) => project.folder === inspection.folder);

        result = { workspaceId: workspace.id, projectId: existing?.id ?? projectId };

        return {
          ...workspace,
          defaults: workspace.defaults.baseLocale ? workspace.defaults : defaults,
          projects: existing
            ? workspace.projects.map((project) =>
                project === existing
                  ? { ...fresh, id: existing.id, addedAt: existing.addedAt }
                  : project,
              )
            : [...workspace.projects, fresh],
        };
      });
    });

    return result;
  }

  /**
   * Changes a workspace. It only touches the profile. A repository that leaves takes its projects out of the workspace and
   * leaves the files where they are, and a new one brings along what the scan finds, when scanning is on.
   *
   * @public
   * @param id The workspace.
   * @param change What changes. The new repositories are absolute paths the user chose.
   * @returns The details.
   */
  public update(id: string, change: IWorkspaceChange): WorkspaceDetail {
    const now = this._now();

    this.require(id);
    this._store.update((workspaces) =>
      workspaces.map((workspace) => {
        if (workspace.id !== id) {
          return workspace;
        }

        const kept = workspace.repositories.filter(
          (_repository, index) => !change.removeRepositories.includes(index),
        );
        const removed = workspace.repositories.filter((repository) => !kept.includes(repository));
        const added = change.addRepositories.filter((repository) => !kept.includes(repository));
        const known = workspace.projects.filter(
          (project) =>
            !removed.some((repository) => PathResolver.isInside(repository, project.folder)),
        );
        const discovered = change.scanForProjects
          ? added.flatMap((repository) => discoverProjects(repository))
          : [];

        return {
          ...workspace,
          name: change.name,
          code: change.code,
          color: change.color,
          scanForProjects: change.scanForProjects,
          defaults: change.defaults,
          repositories: [...kept, ...added],
          projects: [
            ...known,
            ...discovered
              .filter((project) => !known.some((candidate) => candidate.folder === project.folder))
              .map((project) => ({
                id: createSortableId(now),
                name: project.name,
                folder: project.folder,
                kind: project.kind,
                nxTarget: project.nxTarget,
                setup: null,
                snapshot: null,
                addedAt: now.toISOString(),
              })),
          ],
        };
      }),
    );

    return this.detail(id);
  }

  /**
   * Removes a workspace from the profile. The user's files stay where they are.
   *
   * @public
   * @param id The workspace.
   */
  public remove(id: string): void {
    this.require(id);
    this._store.update((workspaces) => workspaces.filter((workspace) => workspace.id !== id));
  }

  /**
   * Marks a workspace as opened now.
   *
   * @public
   * @param id The workspace.
   * @returns The workspace.
   */
  public open(id: string): WorkspaceRecord {
    const openedAt = this._now().toISOString();

    this.require(id);
    this._store.update((workspaces) =>
      workspaces.map((workspace) => (workspace.id === id ? { ...workspace, openedAt } : workspace)),
    );

    return this.require(id);
  }

  /**
   * Remembers what the last look at a project found.
   *
   * @public
   * @param projectId The project.
   * @param snapshot What it found.
   */
  public rememberSnapshot(projectId: string, snapshot: Omit<ProjectSnapshot, 'scannedAt'>): void {
    const scannedAt = this._now().toISOString();

    this._store.update((workspaces) =>
      workspaces.map((workspace) => ({
        ...workspace,
        projects: workspace.projects.map((project) =>
          project.id === projectId ? { ...project, snapshot: { ...snapshot, scannedAt } } : project,
        ),
      })),
    );
  }

  /**
   * Returns a workspace as the title bar shows it.
   *
   * @public
   * @param workspace The workspace.
   * @returns Its reference.
   */
  public refOf(workspace: WorkspaceRecord): WorkspaceRef {
    return { id: workspace.id, code: workspace.code, color: workspace.color, name: workspace.name };
  }

  /**
   * @private
   */
  private recentOf(workspace: WorkspaceRecord): WorkspaceRecent {
    return {
      ...this.refOf(workspace),
      projectCount: workspace.projects.length,
      keyCount: workspace.projects.reduce(
        (sum, project) => sum + (project.snapshot?.keyCount ?? 0),
        0,
      ),
      locales: Array.from(
        new Set(workspace.projects.flatMap((project) => project.snapshot?.locales ?? [])),
      ),
      folderMissing: workspace.repositories.some((repository) => !existsSync(repository)),
    };
  }

  // #endregion
}
