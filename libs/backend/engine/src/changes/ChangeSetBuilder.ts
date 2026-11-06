// #region Imports

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ChangeSet,
  ChangeSetFile,
  ChangeSetSource,
  Finding,
} from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { DisplayPath } from '../paths/DisplayPath';
import { PathResolver } from '../paths/PathResolver.js';

// #endregion

/**
 * The state of a file at the moment it was read.
 */
interface ISnapshot {
  bytes: Buffer | null;
}

/**
 * Collects what a command wants to write into a change set. It reads files and never writes one.
 *
 * @public
 */
export class ChangeSetBuilder {
  // #region Fields

  private readonly _id: string;
  private readonly _cwd: string;
  private readonly _createdAt: Date;
  private readonly _source: ChangeSetSource;
  private readonly _snapshots: Map<string, ISnapshot>;
  private readonly _proposals: Map<string, string>;
  private readonly _findings: Array<Finding>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ChangeSetBuilder` class.
   *
   * @public
   * @param id The id of the change set.
   * @param cwd The working directory of the run.
   * @param createdAt The instant of the change set.
   * @param source Where the change comes from.
   */
  public constructor(id: string, cwd: string, createdAt: Date, source: ChangeSetSource) {
    this._id = id;
    this._cwd = cwd;
    this._createdAt = createdAt;
    this._source = source;
    this._snapshots = new Map();
    this._proposals = new Map();
    this._findings = [];
  }

  // #endregion

  // #region Methods

  /**
   * Remembers what a file holds now. A long-running command takes the snapshot before it starts, so a file that changes
   * during the run fails the apply.
   *
   * @public
   * @param path The path of the file.
   * @throws EngineError `outside-known-roots` for a link that leads out of the repository, which names no path.
   */
  public snapshot(path: string): void {
    const absolute = resolve(path);

    if (!this._snapshots.has(absolute)) {
      if (PathResolver.leavesRepository(absolute)) {
        throw new EngineError(
          'outside-known-roots',
          'A link leads this file out of its repository, so Wortlaut leaves it alone.',
        );
      }

      this._snapshots.set(absolute, {
        bytes: existsSync(absolute) ? readFileSync(absolute) : null,
      });
    }
  }

  /**
   * Takes a file as it is now, because the run that owns this builder wrote it itself in the meantime.
   *
   * @public
   * @param path The path of the file.
   */
  public refresh(path: string): void {
    this._snapshots.delete(resolve(path));
    this.snapshot(path);
  }

  /**
   * Proposes the new content of a file. Without an earlier snapshot, the current state counts as what was read.
   *
   * @public
   * @param path The path of the file.
   * @param content The new content.
   */
  public propose(path: string, content: string): void {
    this.snapshot(path);
    this._proposals.set(resolve(path), content);
  }

  /**
   * Adds a finding that a reviewer should see with the change.
   *
   * @public
   * @param finding The finding.
   */
  public addFinding(finding: Finding): void {
    this._findings.push(finding);
  }

  /**
   * Builds the change set. A file whose new content equals what was read is left out, because nothing changes.
   *
   * @public
   * @param partial Whether the set holds only what a failed or stopped run finished.
   * @returns The change set, in the state `proposed`.
   */
  public build(partial: boolean): ChangeSet {
    const files = new Array<ChangeSetFile>();

    for (const [path, newContent] of this._proposals) {
      const bytes = this._snapshots.get(path)?.bytes ?? null;
      const newBytes = Buffer.from(newContent, 'utf8');

      if (bytes?.equals(newBytes)) {
        continue;
      }

      files.push({
        path,
        displayPath: DisplayPath.relativeTo(this._cwd, path),
        action: bytes ? 'update' : 'create',
        oldContent: bytes ? bytes.toString('utf8') : null,
        oldHash: bytes ? ChangeSetBuilder.hash(bytes) : null,
        newContent,
        newHash: ChangeSetBuilder.hash(newBytes),
      });
    }

    return {
      schemaVersion: 1,
      id: this._id,
      state: 'proposed',
      createdAt: this._createdAt.toISOString(),
      cwd: this._cwd,
      source: this._source,
      files,
      findings: [...this._findings],
      partial,
    };
  }

  /**
   * Returns the hash that identifies the bytes of a file.
   *
   * @public
   * @param bytes The bytes.
   * @returns The SHA-256 as hex.
   */
  public static hash(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  // #endregion
}
