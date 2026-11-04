// #region Imports

import { existsSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ChangeSetJournalEntry, ChangeSetJournalFile } from '@pixel-brewery/wortlaut-contracts';
import { renameOver } from '../io/AtomicFile.js';
import type { ChangeSetJournal, IClaimedJournal } from './ChangeSetJournal.js';
import { ChangeSetBuilder } from './ChangeSetBuilder.js';

// #endregion

/**
 * What became of an apply that a dead process left behind.
 *
 * @public
 */
export interface IRecoveredChangeSet {
    changeSetId: string;
    cwd: string;
    entry: ChangeSetJournalEntry | null;

    /**
     * `finished`: every file now holds the new content. `restored`: no file holds it, apart from `conflicts`. `nothing-written`:
     * the process died before it replaced a file. `failed`: this start could not sort it out, and the next one tries again.
     */
    outcome: 'finished' | 'restored' | 'nothing-written' | 'failed';

    /**
     * The files that changed since, which recovery leaves alone.
     */
    conflicts: Array<string>;

    message: string;
}

/**
 * Sorts out what a crash during an apply left. All staged files on disk means every new content survived, so the change set is
 * finished. Anything else restores what the journal saved. A file that is neither what was read nor what was written belongs to
 * somebody else and stays as it is, and it is named.
 *
 * @internal
 */
export class ChangeSetRecovery {

    // #region Fields

    private readonly _journal: ChangeSetJournal;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ChangeSetRecovery` class.
     *
     * @param journal The journals.
     */
    public constructor(journal: ChangeSetJournal) {
        this._journal = journal;
    }

    // #endregion

    // #region Methods

    /**
     * Recovers every apply whose process is gone.
     *
     * @returns What became of them.
     */
    public recover(): Array<IRecoveredChangeSet> {
        return this._journal.claimAbandoned().map((claimed) => this.recoverOne(claimed));
    }

    /**
     * @private
     */
    private recoverOne(claimed: IClaimedJournal): IRecoveredChangeSet {
        const { entry } = claimed;

        if (!entry || !entry.files.every((file) => isStagedBeside(file))) {
            return {
                changeSetId: claimed.name.split('.')[0],
                cwd: '',
                entry: null,
                outcome: 'failed',
                conflicts: [],
                message: `The journal ${claimed.name} cannot be read, so Wortlaut leaves it alone. Check the files of its change set.`
            };
        }

        try {
            const result = entry.state === 'preparing' ? this.discard(entry) : this.settle(entry);

            this._journal.release(claimed);

            return result;
        } catch (error) {
            return {
                changeSetId: entry.changeSetId,
                cwd: entry.cwd,
                entry,
                outcome: 'failed',
                conflicts: [],
                message: `The interrupted write of ${namesOf(entry)} could not be sorted out: ${error instanceof Error ? error.message : String(error)}. The next start tries again.`
            };
        }
    }

    /**
     * The process died before it replaced a file, so only its staged files remain to go.
     *
     * @private
     */
    private discard(entry: ChangeSetJournalEntry): IRecoveredChangeSet {
        for (const file of entry.files) {
            removeOwnStaged(file);
            removeCreatedDirectories(file);
        }

        return { changeSetId: entry.changeSetId, cwd: entry.cwd, entry, outcome: 'nothing-written', conflicts: [], message: `A write of ${namesOf(entry)} was interrupted before it changed a file. Nothing was written.` };
    }

    /**
     * @private
     */
    private settle(entry: ChangeSetJournalEntry): IRecoveredChangeSet {
        const states = entry.files.map((file) => ({ file, state: stateOf(file) }));

        if (states.every(({ state }) => state === 'written' || state === 'ready')) {
            for (const { file, state } of states) {
                if (state === 'ready') {
                    renameOver(file.staged, file.target);
                }
            }

            return { changeSetId: entry.changeSetId, cwd: entry.cwd, entry, outcome: 'finished', conflicts: [], message: `A write of ${namesOf(entry)} was interrupted, and Wortlaut finished it.` };
        }

        for (const { file, state } of states) {
            if (state === 'written') {
                restore(file);
            }

            removeOwnStaged(file);

            if (file.previous === null) {
                removeCreatedDirectories(file);
            }
        }

        const conflicts = states.filter(({ state }) => state === 'foreign').map(({ file }) => file.displayPath);
        const left = conflicts.length > 0 ? ` ${conflicts.join(', ')} changed since, so it stays as it is.` : '';

        return { changeSetId: entry.changeSetId, cwd: entry.cwd, entry, outcome: 'restored', conflicts, message: `A write of ${namesOf(entry)} was interrupted and could not be finished, so Wortlaut restored the files.${left}` };
    }

    // #endregion

}

/**
 * A staged file always lies beside its target, under the name the applier gives it. A journal that says otherwise is not one of
 * ours, and nothing it names gets touched.
 *
 * @private
 */
function isStagedBeside(file: ChangeSetJournalFile): boolean {
    return file.staged === join(dirname(file.target), `.${basename(file.target)}.wortlaut-staged`);
}

/**
 * @private
 */
function hashOf(path: string): string | null {
    return existsSync(path) ? ChangeSetBuilder.hash(readFileSync(path)) : null;
}

/**
 * @private
 */
function stateOf(file: ChangeSetJournalFile): 'written' | 'ready' | 'lost' | 'foreign' {
    const target = hashOf(file.target);

    if (target === file.newHash) {
        return 'written';
    }

    if (target !== file.oldHash) {
        return 'foreign';
    }

    return hashOf(file.staged) === file.newHash ? 'ready' : 'lost';
}

/**
 * @private
 */
function restore(file: ChangeSetJournalFile): void {
    if (file.oldHash === null) {
        rmSync(file.target, { force: true });

        return;
    }

    if (file.previous === null) {
        throw new Error(`The journal holds no copy of ${file.displayPath}.`);
    }

    const temporary = `${file.staged}.restore`;

    writeFileSync(temporary, Buffer.from(file.previous, 'base64'), { flush: true, ...file.mode === null ? {} : { mode: file.mode } });
    renameOver(temporary, file.target);
}

/**
 * Removes a staged file only when it holds what this apply staged: another process may be staging over the same target.
 *
 * @private
 */
function removeOwnStaged(file: ChangeSetJournalFile): void {
    if (hashOf(file.staged) === file.newHash) {
        rmSync(file.staged, { force: true });
    }
}

/**
 * @private
 */
function removeCreatedDirectories(file: ChangeSetJournalFile): void {
    let directory = dirname(file.target);

    while (file.createdDirectory && directory.startsWith(file.createdDirectory)) {
        try {
            rmdirSync(directory);
        } catch {
            break;
        }

        directory = dirname(directory);
    }
}

/**
 * @private
 */
function namesOf(entry: ChangeSetJournalEntry): string {
    return entry.files.map((file) => file.displayPath).join(', ');
}
