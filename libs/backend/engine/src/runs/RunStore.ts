// #region Imports

import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RunRecordSchema, type RunAssistant, type RunRecord } from '@pixel-brewery/wortlaut-contracts';
import { createSortableId, writePrivateFileAtomically } from '../io/AtomicFile.js';

// #endregion

/**
 * The most runs the store keeps.
 */
const DEFAULT_MAX_RUNS = 200;

/**
 * The most reads of assistants the store keeps. An assistant can ask a lot in one session, and that must not push the
 * commands of the user out of the history.
 */
const DEFAULT_MAX_READS = 100;

/**
 * What the id of a read of an assistant ends with. The bound is found by the file names, so it reads no run.
 */
const READ_SUFFIX = '-read';

/**
 * A temporary file that a crashed process left behind is removed after this time.
 */
const STALE_TEMPORARY_FILE_MS = 60 * 60 * 1000;

/**
 * The run ids that may become a file name.
 */
const VALID_ID = /^[A-Za-z0-9-]+$/;

/**
 * The run history in the user's profile: one file per run, so processes that run in parallel never write the same file.
 * The ids sort by time, so the oldest runs are the first to go when the store exceeds its bound.
 *
 * @public
 */
export class RunStore {

    // #region Fields

    private readonly _directory: string;
    private readonly _maxRuns: number;
    private readonly _maxReads: number;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RunStore` class.
     *
     * @public
     * @param directory The directory of the store.
     * @param maxRuns The most runs to keep.
     * @param maxReads The most reads of assistants to keep, on top of the runs.
     */
    public constructor(directory: string, maxRuns: number = DEFAULT_MAX_RUNS, maxReads: number = DEFAULT_MAX_READS) {
        this._directory = directory;
        this._maxRuns = maxRuns;
        this._maxReads = maxReads;
    }

    // #endregion

    // #region Methods

    /**
     * Creates the id of a read of an assistant, which has a bound of its own.
     *
     * @public
     * @param now The instant.
     * @returns The id.
     */
    public static createReadId(now: Date): string {
        return `${createSortableId(now)}${READ_SUFFIX}`;
    }

    /**
     * Notes who asked for a run and what came of it, for a surface that only knows when the run has ended.
     *
     * @public
     * @param id The run.
     * @param assistant The client, the tool and the result.
     */
    public annotate(id: string, assistant: RunAssistant): void {
        const record = this.get(id);

        if (record) {
            writePrivateFileAtomically(join(this._directory, `${id}.json`), JSON.stringify(RunRecordSchema.parse({ ...record, assistant })));
        }
    }

    /**
     * Stores a run and removes the oldest ones beyond the bound.
     *
     * @public
     * @param record The run.
     * @throws Error when the record is invalid, for example because it holds a secret option, or cannot be written.
     */
    public write(record: RunRecord): void {
        const valid = RunRecordSchema.parse(record);

        writePrivateFileAtomically(join(this._directory, `${valid.id}.json`), JSON.stringify(valid));
        this.prune();
    }

    /**
     * Returns the stored runs, newest first. A file that cannot be read is left out.
     *
     * @public
     * @returns The runs.
     */
    public list(): Array<RunRecord> {
        return this.fileNames().reverse()
            .flatMap((name) => {
                try {
                    return [RunRecordSchema.parse(JSON.parse(readFileSync(join(this._directory, name), 'utf8')))];
                } catch {
                    return [];
                }
            });
    }

    /**
     * Returns a stored run.
     *
     * @public
     * @param id The id of the run.
     * @returns The run, or `null` when the store does not hold it.
     */
    public get(id: string): RunRecord | null {
        if (!VALID_ID.test(id)) {
            return null;
        }

        try {
            return RunRecordSchema.parse(JSON.parse(readFileSync(join(this._directory, `${id}.json`), 'utf8')));
        } catch {
            return null;
        }
    }

    /**
     * @private
     */
    private prune(): void {
        const names = this.fileNames();
        const reads = names.filter((name) => name.endsWith(`${READ_SUFFIX}.json`));
        const runs = names.filter((name) => !name.endsWith(`${READ_SUFFIX}.json`));

        for (const name of [...runs.slice(0, Math.max(0, runs.length - this._maxRuns)), ...reads.slice(0, Math.max(0, reads.length - this._maxReads))]) {
            // Another process may be removing the same file at the same time.
            rmSync(join(this._directory, name), { force: true });
        }

        for (const name of readdirSync(this._directory).filter((entry) => entry.endsWith('.tmp'))) {
            const path = join(this._directory, name);

            try {
                if (Date.now() - statSync(path).mtimeMs > STALE_TEMPORARY_FILE_MS) {
                    rmSync(path, { force: true });
                }
            } catch {
                // It was renamed or removed in the meantime, which is what this loop wants anyway.
            }
        }
    }

    /**
     * @private
     */
    private fileNames(): Array<string> {
        try {
            return readdirSync(this._directory).filter((name) => name.endsWith('.json'))
                .sort((a, b) => a.localeCompare(b));
        } catch {
            return [];
        }
    }

    // #endregion

}
