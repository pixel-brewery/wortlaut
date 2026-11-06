// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { WorkspaceFileSchema, type WorkspaceRecord } from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { writePrivateFileAtomically } from '../io/AtomicFile.js';

// #endregion

/**
 * The workspaces in the user's profile: one file, replaced as a whole. A file that cannot be read is a failure and stays
 * untouched, because writing over it would lose the user's workspaces.
 *
 * @internal
 */
export class WorkspaceStore {
  // #region Fields

  private readonly _file: string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `WorkspaceStore` class.
   *
   * @param file The path of the file.
   */
  public constructor(file: string) {
    this._file = file;
  }

  // #endregion

  // #region Methods

  /**
   * Returns the stored workspaces.
   *
   * @returns The workspaces, none when the file does not exist yet.
   * @throws EngineError when the file exists and is invalid.
   */
  public read(): Array<WorkspaceRecord> {
    if (!existsSync(this._file)) {
      return [];
    }

    try {
      return WorkspaceFileSchema.parse(JSON.parse(readFileSync(this._file, 'utf8'))).workspaces;
    } catch {
      throw new EngineError(
        'workspace-store-invalid',
        `The workspace list ${this._file} cannot be read. It was left as it is.`,
        [this._file],
      );
    }
  }

  /**
   * Changes the stored workspaces.
   *
   * @param change Receives the workspaces and returns the new ones.
   */
  public update(change: (workspaces: Array<WorkspaceRecord>) => Array<WorkspaceRecord>): void {
    const content = WorkspaceFileSchema.parse({
      schemaVersion: 1,
      workspaces: change(this.read()),
    });

    writePrivateFileAtomically(this._file, JSON.stringify(content));
  }

  // #endregion
}
