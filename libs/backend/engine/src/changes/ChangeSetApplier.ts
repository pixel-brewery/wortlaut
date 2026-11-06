// #region Imports

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
  ChangeSet,
  ChangeSetFile,
  ChangeSetJournalEntry,
  ChangeSetJournalFile,
} from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '../errors/EngineError.js';
import { renameOver } from '../io/AtomicFile.js';
import { PathResolver } from '../paths/PathResolver.js';
import { ChangeSetBuilder } from './ChangeSetBuilder.js';
import type { ChangeSetJournal } from './ChangeSetJournal.js';

// #endregion

/**
 * A staged file that a crashed process left behind stops blocking the file after this time.
 */
const STALE_STAGED_FILE_MS = 5 * 60 * 1000;

/**
 * One file during an apply.
 */
interface IStagedFile {
  file: ChangeSetFile;
  target: string;
  staged: string;

  /**
   * The topmost directory that was created for this file.
   */
  createdDirectory: string | null;

  /**
   * What the target held when it was checked, to undo the write.
   */
  previous: Buffer | null;

  /**
   * The permission bits of the target, or `null` for a file that does not exist yet.
   */
  mode: number | null;
}

/**
 * What an applier is composed of.
 *
 * @internal
 */
export interface IChangeSetApplierInit {
  /**
   * Notes each apply in the profile, so a start after a crash can finish or restore it.
   */
  journal?: ChangeSetJournal | null;

  /**
   * Runs after each rename, for a test that dies in between.
   */
  onRenamed?: (index: number) => void;
}

/**
 * Says that restoring failed as well, so the journal has to stay for the next start.
 */
class RestoreFailedError extends EngineError {}

/**
 * Applies a change set: every file is checked again, and all of them are written or none.
 *
 * @remarks
 * Applying has three steps. The new content goes into a staged file beside each target, created exclusively, so two
 * processes that apply over the same file exclude each other. Then every target is compared with what was read. Only
 * then the staged files are renamed over their targets, and a failure in this step restores what was already renamed. A journal
 * in the profile covers what a thrown error cannot: a process that dies between two renames is sorted out by the next start.
 *
 * @public
 */
export class ChangeSetApplier {
  // #region Fields

  private readonly _journal: ChangeSetJournal | null;
  private readonly _onRenamed: ((index: number) => void) | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ChangeSetApplier` class.
   *
   * @param init What it is composed of.
   */
  public constructor(init: IChangeSetApplierInit = {}) {
    this._journal = init.journal ?? null;
    this._onRenamed = init.onRenamed ?? null;
  }

  // #endregion

  // #region Methods

  /**
   * Applies a change set.
   *
   * @public
   * @param changeSet The change set.
   * @param afterCommit Runs when every file is written, while the journal still covers the apply, so what belongs to the write
   * happens with it, even after a crash in between.
   * @throws EngineError `change-set-conflict`, naming the files that changed since they were read, or
   * `change-set-write-failed`, naming the file that could not be written. Nothing is written in either case.
   */
  public apply(changeSet: ChangeSet, afterCommit?: () => void): void {
    const staged = new Array<IStagedFile>();
    let journal =
      this._journal?.begin(
        changeSet,
        changeSet.files.map((file) => this.toJournalFile(this.locate(file))),
      ) ?? null;
    let keepJournal = false;

    try {
      for (const file of changeSet.files) {
        staged.push(this.stage(file));
      }

      this.check(staged);

      if (journal) {
        journal = this.noteCommit(journal, staged);
      }

      this.commit(staged);
      this.finishWrite(afterCommit);
    } catch (error) {
      keepJournal = error instanceof RestoreFailedError;
      this.cleanUp(staged);

      throw error instanceof EngineError
        ? error
        : this.toWriteError(error, changeSet.files[staged.length]);
    } finally {
      if (journal && !keepJournal) {
        this._journal?.finish(changeSet.id);
      }
    }
  }

  /**
   * Every file is written by now, so what follows cannot turn the apply into a failure.
   *
   * @private
   */
  private finishWrite(afterCommit: (() => void) | undefined): void {
    try {
      afterCommit?.();
    } catch {
      // A review list that cannot be changed shows the set with a conflict, which tells the truth about it.
    }
  }

  /**
   * Finds where a file goes, for the journal and the staged file.
   *
   * @private
   */
  private locate(file: ChangeSetFile): Omit<IStagedFile, 'createdDirectory' | 'previous' | 'mode'> {
    if (PathResolver.leavesRepository(file.path)) {
      throw new EngineError(
        'change-set-write-failed',
        `A link leads the file ${file.displayPath} out of its repository. Nothing was written.`,
        [file.displayPath],
      );
    }

    // The target of a symbolic link is what gets written, as a plain write would, and the link stays.
    const target = existsSync(file.path) ? realpathSync(file.path) : file.path;

    return { file, target, staged: join(dirname(target), `.${basename(target)}.wortlaut-staged`) };
  }

  /**
   * @private
   */
  private toJournalFile(
    entry: Pick<IStagedFile, 'file' | 'target' | 'staged'> & Partial<IStagedFile>,
  ): ChangeSetJournalFile {
    return {
      target: entry.target,
      staged: entry.staged,
      displayPath: entry.file.displayPath,
      action: entry.file.action,
      oldHash: entry.file.oldHash,
      newHash: entry.file.newHash,
      createdDirectory: entry.createdDirectory ?? null,
      previous: entry.previous ? entry.previous.toString('base64') : null,
      mode: entry.mode ?? null,
    };
  }

  /**
   * @private
   */
  private noteCommit(
    journal: ChangeSetJournalEntry,
    staged: ReadonlyArray<IStagedFile>,
  ): ChangeSetJournalEntry {
    return (this._journal as ChangeSetJournal).commit(
      journal,
      staged.map((entry) => this.toJournalFile(entry)),
    );
  }

  /**
   * Writes the new content into a staged file beside the target.
   *
   * @private
   */
  private stage(file: ChangeSetFile): IStagedFile {
    const { target, staged } = this.locate(file);
    const mode = existsSync(target) ? statSync(target).mode & 0o777 : null;

    // A read-only file stays protected, although a rename over it would succeed.
    if (mode !== null && (mode & 0o222) === 0) {
      throw new EngineError(
        'change-set-write-failed',
        `The file ${file.displayPath} is read-only. Nothing was written.`,
        [file.displayPath],
      );
    }

    const createdDirectory = this.createDirectory(dirname(target));
    const entry: IStagedFile = { file, target, staged, createdDirectory, previous: null, mode };

    this.writeStaged(entry, mode);

    return entry;
  }

  /**
   * @private
   */
  private writeStaged(entry: IStagedFile, mode: number | null): void {
    const options = { flag: 'wx', ...(mode === null ? {} : { mode }) };
    const content = Buffer.from(entry.file.newContent, 'utf8');

    try {
      writeFileSync(entry.staged, content, options);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - statSync(entry.staged).mtimeMs < STALE_STAGED_FILE_MS) {
        throw new EngineError(
          'change-set-conflict',
          `Another process is writing the file ${entry.file.displayPath}. Nothing was written.`,
          [entry.file.displayPath],
        );
      }

      rmSync(entry.staged, { force: true });
      writeFileSync(entry.staged, content, options);
    }
  }

  /**
   * Compares every target with what was read.
   *
   * @private
   */
  private check(staged: Array<IStagedFile>): void {
    const conflicts = new Array<string>();

    for (const entry of staged) {
      entry.previous = existsSync(entry.target) ? readFileSync(entry.target) : null;

      const hash = entry.previous ? ChangeSetBuilder.hash(entry.previous) : null;

      if (hash !== entry.file.oldHash) {
        conflicts.push(entry.file.displayPath);
      }
    }

    if (conflicts.length > 0) {
      throw new EngineError(
        'change-set-conflict',
        `${conflicts.join(', ')} changed since the change set was built. Nothing was written.`,
        conflicts,
      );
    }
  }

  /**
   * Renames the staged files over their targets. A failure restores the targets that were already replaced.
   *
   * @private
   */
  private commit(staged: Array<IStagedFile>): void {
    const committed = new Array<IStagedFile>();

    for (const [index, entry] of staged.entries()) {
      try {
        renameOver(entry.staged, entry.target);
        committed.push(entry);
        this._onRenamed?.(index);
      } catch (error) {
        this.rollBack(committed, entry.file);

        throw this.toWriteError(error, entry.file);
      }
    }
  }

  /**
   * @private
   */
  private rollBack(committed: Array<IStagedFile>, failed: ChangeSetFile): void {
    const files = committed.map((entry) => entry.file.displayPath);

    try {
      for (const entry of [...committed].reverse()) {
        if (entry.previous) {
          writeFileSync(entry.staged, entry.previous, {
            mode: statSync(entry.target).mode & 0o777,
          });
          renameOver(entry.staged, entry.target);
        } else {
          rmSync(entry.target, { force: true });
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      throw new RestoreFailedError(
        'change-set-write-failed',
        `Writing ${failed.displayPath} failed and restoring failed as well: ${reason}. Check ${files.join(', ')}.`,
        files,
      );
    }
  }

  /**
   * Creates a directory with its parents. The result of `mkdirSync` does not spell the path as the target does on every
   * platform, and the clean-up compares the two.
   *
   * @private
   * @returns The first directory it created, or `null` when the directory was there.
   */
  private createDirectory(directory: string): string | null {
    let created: string | null = null;

    for (
      let current = directory;
      !existsSync(current) && dirname(current) !== current;
      current = dirname(current)
    ) {
      created = current;
    }

    mkdirSync(directory, { recursive: true });

    return created;
  }

  /**
   * Removes what a failed apply left: staged files, and the directories it created if they stayed empty.
   *
   * @private
   */
  private cleanUp(staged: Array<IStagedFile>): void {
    for (const entry of staged) {
      rmSync(entry.staged, { force: true });

      let directory = dirname(entry.target);

      while (entry.createdDirectory && directory.startsWith(entry.createdDirectory)) {
        try {
          rmdirSync(directory);
        } catch {
          break;
        }

        directory = dirname(directory);
      }
    }
  }

  /**
   * @private
   */
  private toWriteError(error: unknown, file: ChangeSetFile | undefined): EngineError {
    const message = error instanceof Error ? error.message : String(error);
    const name = file?.displayPath ?? 'a file';

    return new EngineError(
      'change-set-write-failed',
      `Writing ${name} failed: ${message}. Nothing was written.`,
      file ? [file.displayPath] : [],
    );
  }

  // #endregion
}
