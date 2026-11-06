// #region Imports

import { readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChangeSetJournalSchema,
  type ChangeSet,
  type ChangeSetJournalEntry,
  type ChangeSetJournalFile,
} from '@pixel-brewery/wortlaut-contracts';
import { writePrivateFileAtomically } from '../io/AtomicFile.js';

// #endregion

/**
 * A journal older than this belongs to nobody, even when its process id is in use again.
 */
const STALE_JOURNAL_MS = 5 * 60 * 1000;

/**
 * The extension of a journal somebody is recovering right now.
 */
const CLAIM_EXTENSION = '.claim';

/**
 * A journal that was left behind and that this process took over.
 *
 * @internal
 */
export interface IClaimedJournal {
  entry: ChangeSetJournalEntry | null;
  path: string;

  /**
   * The name of the journal, for a message about one that cannot be read.
   */
  name: string;
}

/**
 * The journals of the applies that are going on, one file per change set in the user's profile. Only this process writes its
 * own journal, and the first process that starts after a crash takes over what the dead one left.
 *
 * @internal
 */
export class ChangeSetJournal {
  // #region Fields

  private readonly _directory: string;
  private readonly _now: () => Date;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ChangeSetJournal` class.
   *
   * @param directory The directory of the journals.
   * @param now The clock.
   */
  public constructor(directory: string, now: () => Date = () => new Date()) {
    this._directory = directory;
    this._now = now;
  }

  // #endregion

  // #region Methods

  /**
   * Notes that an apply starts. A profile that cannot be written, as on a CI runner, has no journal, which must not fail a
   * command that worked without one.
   *
   * @param changeSet The change set.
   * @param files The files as the apply will write them.
   * @returns The entry, or `null` when it could not be written.
   */
  public begin(
    changeSet: ChangeSet,
    files: ReadonlyArray<ChangeSetJournalFile>,
  ): ChangeSetJournalEntry | null {
    const entry: ChangeSetJournalEntry = {
      schemaVersion: 1,
      changeSetId: changeSet.id,
      state: 'preparing',
      pid: process.pid,
      startedAt: this._now().toISOString(),
      cwd: changeSet.cwd,
      source: changeSet.source,
      partial: changeSet.partial,
      files: [...files],
    };

    return this.write(entry) ? entry : null;
  }

  /**
   * Notes that the apply starts renaming, with what restores each file. Only after this returned may a target change.
   *
   * @param entry The entry.
   * @param files The files with what they held.
   * @returns The new entry.
   * @throws Error when it cannot be written, which stops the apply before it changed anything.
   */
  public commit(
    entry: ChangeSetJournalEntry,
    files: ReadonlyArray<ChangeSetJournalFile>,
  ): ChangeSetJournalEntry {
    const next: ChangeSetJournalEntry = { ...entry, state: 'committing', files: [...files] };

    writePrivateFileAtomically(this.pathOf(entry.changeSetId), JSON.stringify(next));

    return next;
  }

  /**
   * Forgets an apply that ended.
   *
   * @param changeSetId The change set.
   */
  public finish(changeSetId: string): void {
    rmSync(this.pathOf(changeSetId), { force: true });
  }

  /**
   * Takes over the journals of processes that are gone. Renaming decides who recovers, so two processes that start at the same
   * time never work on one journal.
   *
   * @returns What this process has to recover.
   */
  public claimAbandoned(): Array<IClaimedJournal> {
    return this.names().flatMap((name) => {
      const path = join(this._directory, name);

      if (!this.isAbandoned(name, path)) {
        return [];
      }

      const claim = join(this._directory, `${this.idOf(name)}.${process.pid}${CLAIM_EXTENSION}`);

      try {
        renameSync(path, claim);
      } catch {
        return [];
      }

      return [{ entry: this.read(claim), path: claim, name }];
    });
  }

  /**
   * Ends the recovery of a journal.
   *
   * @param claimed The journal.
   */
  public release(claimed: IClaimedJournal): void {
    rmSync(claimed.path, { force: true });
  }

  /**
   * @private
   */
  private write(entry: ChangeSetJournalEntry): boolean {
    try {
      writePrivateFileAtomically(this.pathOf(entry.changeSetId), JSON.stringify(entry));

      return true;
    } catch {
      return false;
    }
  }

  /**
   * @private
   */
  private read(path: string): ChangeSetJournalEntry | null {
    try {
      return ChangeSetJournalSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      return null;
    }
  }

  /**
   * Says whether nobody works on a journal anymore: its process is gone, or it is too old to be anybody's. This process has no
   * apply going on while it recovers, because applying runs without a pause.
   *
   * @private
   */
  private isAbandoned(name: string, path: string): boolean {
    const owner = this.ownerOf(name, path);

    if (owner === null || owner === process.pid || !isAlive(owner)) {
      return true;
    }

    try {
      return this._now().getTime() - statSync(path).mtimeMs > STALE_JOURNAL_MS;
    } catch {
      return false;
    }
  }

  /**
   * @private
   */
  private ownerOf(name: string, path: string): number | null {
    if (name.endsWith(CLAIM_EXTENSION)) {
      return Number(name.slice(0, -CLAIM_EXTENSION.length).split('.').at(-1));
    }

    return this.read(path)?.pid ?? null;
  }

  /**
   * @private
   */
  private idOf(name: string): string {
    return name.split('.')[0];
  }

  /**
   * @private
   */
  private names(): Array<string> {
    try {
      return readdirSync(this._directory).filter(
        (name) => name.endsWith('.json') || name.endsWith(CLAIM_EXTENSION),
      );
    } catch {
      return [];
    }
  }

  /**
   * @private
   */
  private pathOf(changeSetId: string): string {
    return join(this._directory, `${changeSetId}.json`);
  }

  // #endregion
}

/**
 * @private
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
