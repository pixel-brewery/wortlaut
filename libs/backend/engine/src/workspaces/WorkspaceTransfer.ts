// #region Imports

import { basename } from 'node:path';
import {
  WORKSPACE_EXPORT_FORMAT,
  WorkspaceExportSchema,
  type WorkspaceExport,
  type WorkspaceImportPreview,
  type WorkspaceImportResult,
} from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { createSortableId } from '../io/AtomicFile.js';
import type { RulePackService } from '../rulepacks/RulePackService.js';
import type { WorkspaceService } from './WorkspaceService.js';

// #endregion

/**
 * The largest file of a workspace that gets read.
 *
 * @public
 */
export const MAX_WORKSPACE_FILE_BYTES = 1024 * 1024;

/**
 * The most checked files that wait for the step that adds them.
 */
const MAX_PENDING_IMPORTS = 8;

/**
 * What moving a workspace is composed of.
 *
 * @internal
 */
export interface IWorkspaceTransferInit {
  workspaces: WorkspaceService;
  rulePacks: RulePackService;
  now: () => Date;
}

/**
 * Moves a workspace between computers: its settings and references to its pinned packs, and never a key, a login or a path. A file
 * from somewhere else is untrusted: it is checked and shown before anything changes, and adding it gains it no folder, because the
 * user chooses each one in a native dialog.
 *
 * @public
 */
export class WorkspaceTransfer {
  // #region Fields

  private readonly _init: IWorkspaceTransferInit;
  private readonly _pending: Map<string, WorkspaceExport>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `WorkspaceTransfer` class.
   *
   * @param init What it is composed of.
   */
  public constructor(init: IWorkspaceTransferInit) {
    this._init = init;
    this._pending = new Map();
  }

  // #endregion

  // #region Methods

  /**
   * Writes the file of a workspace.
   *
   * @public
   * @param workspaceId The workspace.
   * @returns The text of the file.
   */
  public exportText(workspaceId: string): string {
    const workspace = this._init.workspaces.require(workspaceId);
    const file: WorkspaceExport = {
      format: WORKSPACE_EXPORT_FORMAT,
      schemaVersion: 1,
      workspace: {
        name: workspace.name,
        code: workspace.code,
        color: workspace.color,
        scanForProjects: workspace.scanForProjects,
        defaults: workspace.defaults,
        repositories: workspace.repositories.map((repository) => ({ name: basename(repository) })),
        packs: this._init.rulePacks.pinnedReferences(workspaceId),
      },
    };

    return `${JSON.stringify(WorkspaceExportSchema.parse(file), null, 2)}\n`;
  }

  /**
   * Checks a file and says what it would add. Nothing changes.
   *
   * @public
   * @param text The text of the file.
   * @param fileName The name of the file.
   * @returns What it would add.
   * @throws EngineError `invalid-arguments` for a file that is not a workspace. The message names what is wrong and repeats nothing
   * of its content.
   */
  public preview(text: string, fileName: string): WorkspaceImportPreview {
    const file = this.parse(text);
    const importId = createSortableId(this._init.now());

    this._pending.set(importId, file);

    for (const oldest of this._pending.keys()) {
      if (this._pending.size <= MAX_PENDING_IMPORTS) {
        break;
      }

      this._pending.delete(oldest);
    }

    const { workspace } = file;

    return {
      importId,
      fileName,
      name: workspace.name,
      code: workspace.code,
      color: workspace.color,
      scanForProjects: workspace.scanForProjects,
      defaults: workspace.defaults,
      repositories: workspace.repositories,
      packs: workspace.packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        source: pack.source,
        version: pack.version,
        kind: packKindOf(pack.source),
      })),
      nameTaken: this._init.workspaces.all().some((candidate) => candidate.name === workspace.name),
    };
  }

  /**
   * Adds a checked file as a new workspace. It never changes one that exists. Its packs go through the check of any other pack:
   * a source that does not give what the file pinned is refused, and a pin is one change set per repository, under Dry run.
   *
   * @public
   * @param importId The checked file.
   * @param folders The folders the user chose.
   * @param dryRun The value of Dry run.
   * @returns What it did.
   * @throws EngineError when the check is gone.
   */
  public async add(
    importId: string,
    folders: ReadonlyArray<string>,
    dryRun: boolean,
  ): Promise<WorkspaceImportResult> {
    const file = this._pending.get(importId);

    if (!file) {
      throw new EngineError(
        'invalid-arguments',
        'This file is no longer available. Choose it again.',
      );
    }

    this._pending.delete(importId);

    const { workspace } = file;
    const created = this._init.workspaces.adopt({
      name: workspace.name,
      code: workspace.code,
      color: workspace.color,
      scanForProjects: workspace.scanForProjects,
      defaults: workspace.defaults,
      repositories: folders,
    });
    const packs = new Array<WorkspaceImportResult['packs'][number]>();

    // One after the other: every pack may fetch, and each write of a repository reads what the one before left.
    for (const pack of workspace.packs) {
      // eslint-disable-next-line no-await-in-loop
      packs.push({
        name: pack.name,
        ...(await this._init.rulePacks.importReference(created.workspaceId, pack, dryRun)),
      });
    }

    return { workspaceId: created.workspaceId, discovered: created.discovered, packs };
  }

  /**
   * @private
   */
  private parse(text: string): WorkspaceExport {
    if (Buffer.byteLength(text, 'utf8') > MAX_WORKSPACE_FILE_BYTES) {
      throw new EngineError('invalid-arguments', 'This file is too large to be a workspace.');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new EngineError(
        'invalid-arguments',
        'This file is not a workspace: it is not valid JSON.',
      );
    }

    const result = WorkspaceExportSchema.safeParse(parsed);

    if (!result.success) {
      const issues = result.error.issues
        .slice(0, 5)
        .map(
          (issue) =>
            `${issue.path.join('.') || 'file'}: ${issue.code === 'unrecognized_keys' ? 'it holds something a workspace does not' : 'the value is not valid'}`,
        );

      throw new EngineError(
        'invalid-arguments',
        `This file is not a workspace. ${issues.join('; ')}.`,
      );
    }

    return result.data;
  }

  // #endregion
}

/**
 * @private
 */
function packKindOf(source: string): WorkspaceImportPreview['packs'][number]['kind'] {
  if (source.startsWith('wortlaut:')) {
    return 'shipped';
  }

  return source.startsWith('github:') || source.startsWith('npm:') ? 'fetch' : 'repository';
}
