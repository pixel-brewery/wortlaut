// #region Imports

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeSetSchema, type ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { writePrivateFileAtomically } from '../io/AtomicFile.js';

// #endregion

/**
 * The most change sets that may wait for review. Each one holds whole files, so the list needs a bound.
 */
const DEFAULT_MAX_PENDING = 100;

/**
 * The change set ids that may become a file name.
 */
const VALID_ID = /^[A-Za-z0-9-]+$/;

/**
 * The pending change sets, shared between processes: one file per change set in the user's profile.
 *
 * @public
 */
export class ReviewList {
  // #region Fields

  private readonly _directory: string;
  private readonly _maxPending: number;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ReviewList` class.
   *
   * @public
   * @param directory The directory of the list.
   * @param maxPending The most change sets that may wait.
   */
  public constructor(directory: string, maxPending: number = DEFAULT_MAX_PENDING) {
    this._directory = directory;
    this._maxPending = maxPending;
  }

  // #endregion

  // #region Methods

  /**
   * Adds a change set to the list.
   *
   * @public
   * @param changeSet The change set.
   * @returns The stored change set in the state `pending`.
   * @throws EngineError when the list is full or the profile cannot be written.
   */
  public add(changeSet: ChangeSet): ChangeSet {
    const pending = ChangeSetSchema.parse({ ...changeSet, state: 'pending' });

    if (this.fileNames().length >= this._maxPending) {
      throw new EngineError(
        'review-list-full',
        `The review list already holds ${this._maxPending} change sets. Apply or discard some of them first.`,
      );
    }

    try {
      writePrivateFileAtomically(this.pathOf(pending.id), JSON.stringify(pending));
    } catch (error) {
      throw new EngineError(
        'review-list-unavailable',
        `The review list in ${this._directory} cannot be written: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return pending;
  }

  /**
   * Returns the pending change sets, oldest first. A file that cannot be read is left out and stays where it is.
   *
   * @public
   * @returns The change sets.
   */
  public list(): Array<ChangeSet> {
    return this.fileNames().flatMap((name) => {
      try {
        return [
          ChangeSetSchema.parse(JSON.parse(readFileSync(join(this._directory, name), 'utf8'))),
        ];
      } catch {
        return [];
      }
    });
  }

  /**
   * Returns a pending change set.
   *
   * @public
   * @param id The id of the change set.
   * @returns The change set.
   * @throws EngineError when the list does not hold it.
   */
  public get(id: string): ChangeSet {
    const notFound = (): EngineError =>
      new EngineError('change-set-not-found', `The review list holds no change set '${id}'.`);

    if (!VALID_ID.test(id)) {
      throw notFound();
    }

    try {
      return ChangeSetSchema.parse(JSON.parse(readFileSync(this.pathOf(id), 'utf8')));
    } catch {
      throw notFound();
    }
  }

  /**
   * Removes a change set from the list. Removing one that is gone does nothing, because another process may have
   * applied it at the same time.
   *
   * @public
   * @param id The id of the change set.
   */
  public remove(id: string): void {
    if (VALID_ID.test(id)) {
      rmSync(this.pathOf(id), { force: true });
    }
  }

  /**
   * @private
   */
  private pathOf(id: string): string {
    return join(this._directory, `${id}.json`);
  }

  /**
   * @private
   */
  private fileNames(): Array<string> {
    try {
      return readdirSync(this._directory)
        .filter((name) => name.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  // #endregion
}
