// #region Imports

import { extname } from 'node:path';
import type {
  ProjectRecord,
  SearchFileResult,
  SearchResults,
  WorkspaceRecord,
} from '@pixel-brewery/wortlaut-contracts';
import { Presets } from '@pixel-brewery/wortlaut-core';
import type { CatalogService } from '../catalogs/CatalogService.js';
import { EngineError } from '../errors/EngineError.js';
import { createSortableId } from '../io/AtomicFile.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import type { ProjectService } from '../projects/ProjectService.js';
import { walkRepository } from '../projects/RepositoryWalker.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import { DisplayPath } from '../paths/DisplayPath';

// #endregion

/**
 * The most keys and the most files one search hands back.
 */
const MAX_RESULTS = 12;

/**
 * How long a look at the files of a project stays good. Walking a repository takes a moment, and a search asks with every key press.
 */
const FILE_LIST_TTL_MS = 30_000;

/**
 * The most file names of the last searches that a later request can open by id.
 */
const MAX_REMEMBERED_FILES = 512;

/**
 * What the search is composed of.
 *
 * @internal
 */
export interface ISearchServiceInit {
  workspaces: WorkspaceService;
  projects: ProjectService;
  catalogs: CatalogService;
  now: () => Date;
}

/**
 * The files of a project, as the last look found them.
 */
interface IFileList {
  readAt: number;
  files: Array<{ path: string; file: string; kind: SearchFileResult['kind'] }>;
}

/**
 * The search of the title bar: keys and files of the open workspace, the open project first. A project that cannot be read is left
 * out, because a search is no place for its failure. A file leaves as an id, and only main knows the path behind it.
 *
 * @public
 */
export class SearchService {
  // #region Fields

  private readonly _init: ISearchServiceInit;
  private readonly _fileLists: Map<string, IFileList>;
  private readonly _files: Map<string, string>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `SearchService` class.
   *
   * @param init What the search is composed of.
   */
  public constructor(init: ISearchServiceInit) {
    this._init = init;
    this._fileLists = new Map();
    this._files = new Map();
  }

  // #endregion

  // #region Methods

  /**
   * Searches the keys and files of a workspace.
   *
   * @public
   * @param workspaceId The workspace.
   * @param projectId The open project, whose results come first.
   * @param text What to look for.
   * @returns What it found.
   */
  public query(workspaceId: string, projectId: string | null, text: string): SearchResults {
    const search = text.trim().toLowerCase();
    const workspace = this._init.workspaces.require(workspaceId);
    const results: SearchResults = { keys: [], files: [], truncated: false };

    if (search.length === 0) {
      return results;
    }

    for (const project of this.inOrder(workspace, projectId)) {
      this.addKeys(results, project, search);
      this.addFiles(results, project, search);
    }

    return results;
  }

  /**
   * Returns the path of a file the search found.
   *
   * @public
   * @param id The id of the result.
   * @returns The absolute path.
   * @throws EngineError when no search handed out this id.
   */
  public pathOf(id: string): string {
    const path = this._files.get(id);

    if (!path) {
      throw new EngineError(
        'invalid-arguments',
        'This result is no longer available. Search again.',
      );
    }

    return path;
  }

  /**
   * @private
   */
  private inOrder(workspace: WorkspaceRecord, projectId: string | null): Array<ProjectRecord> {
    return [...workspace.projects].sort(
      (a, b) => Number(b.id === projectId) - Number(a.id === projectId),
    );
  }

  /**
   * @private
   */
  private addKeys(results: SearchResults, project: ProjectRecord, search: string): void {
    if (results.keys.length >= MAX_RESULTS) {
      results.truncated = true;

      return;
    }

    try {
      const { rows, matching } = this._init.catalogs.keys({
        projectId: project.id,
        namespace: null,
        search,
        filter: 'all',
        targetLocale: null,
        limit: MAX_RESULTS - results.keys.length,
      });

      results.keys.push(
        ...rows.map((row) => ({
          key: row.key,
          value: row.base,
          projectId: project.id,
          projectName: project.name,
        })),
      );
      results.truncated ||= matching > rows.length;
    } catch {
      // Its catalogs cannot be read right now, so it has no results.
    }
  }

  /**
   * @private
   */
  private addFiles(results: SearchResults, project: ProjectRecord, search: string): void {
    for (const entry of this.filesOf(project).filter(({ file }) =>
      file.toLowerCase().includes(search),
    )) {
      if (results.files.length >= MAX_RESULTS) {
        results.truncated = true;

        return;
      }

      results.files.push({
        id: this.remember(entry.path),
        file: entry.file,
        kind: entry.kind,
        projectId: project.id,
        projectName: project.name,
      });
    }
  }

  /**
   * Lists the catalogs and the settings file of a project and its source files, with what Detect would read.
   *
   * @private
   */
  private filesOf(project: ProjectRecord): IFileList['files'] {
    const now = this._init.now().getTime();
    const known = this._fileLists.get(project.id);

    if (known && now - known.readAt < FILE_LIST_TTL_MS) {
      return known.files;
    }

    const files = new Map<string, IFileList['files'][number]>();
    const add = (path: string, kind: SearchFileResult['kind']): void => {
      if (!files.has(path)) {
        files.set(path, { path, file: DisplayPath.relativeTo(project.folder, path), kind });
      }
    };

    try {
      for (const catalog of this._init.catalogs.stats(project.id).catalogs) {
        add(catalog.path, 'catalog');
      }

      const settings = this._init.projects.sourceFilePath(project.id);

      if (settings) {
        add(settings, 'settings');
      }

      for (const path of this.sourcesOf(project)) {
        add(path, 'source');
      }
    } catch {
      // What could be read stays in the list.
    }

    const list = { readAt: now, files: Array.from(files.values()) };

    this._fileLists.set(project.id, list);

    return list.files;
  }

  /**
   * @private
   */
  private sourcesOf(project: ProjectRecord): Array<string> {
    const configuration = this._init.projects.resolve(project);
    const { root } = configuration;
    const preset = configuration.options.actions?.detect?.preset;

    if (!root || !preset) {
      return [];
    }

    const extensions = new Set(Presets.get(QUIET_LOGGER, preset as Presets).getExtensions());

    return walkRepository(root).files.filter((file) => extensions.has(extname(file)));
  }

  /**
   * @private
   */
  private remember(path: string): string {
    const id = createSortableId(this._init.now());

    this._files.set(id, path);

    for (const oldest of this._files.keys()) {
      if (this._files.size <= MAX_REMEMBERED_FILES) {
        break;
      }

      this._files.delete(oldest);
    }

    return id;
  }

  // #endregion
}
