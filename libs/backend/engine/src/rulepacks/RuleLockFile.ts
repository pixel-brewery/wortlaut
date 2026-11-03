// #region Imports

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { RuleLockSchema, type RuleLock } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The lock file, and the name it had before, which stays supported as a fallback.
 *
 * @public
 */
export const LOCK_FILE_NAME = 'wortlaut.lock.json';

/**
 * @public
 */
export const LEGACY_LOCK_FILE_NAME = 'localizator.lock.json';

/**
 * The largest lock file that is read.
 */
const MAX_LOCK_BYTES = 4 * 1024 * 1024;

/**
 * What a directory says about its lock file.
 *
 * @internal
 */
export interface ILockFileState {

    /**
     * The file to write: the one that exists, or a new `wortlaut.lock.json`.
     */
    path: string;
    exists: boolean;
    lock: RuleLock;

    /**
     * Why the file cannot be used. Nothing of it is trusted then, and nothing is written over it.
     */
    problem: string | null;
}

/**
 * Reads and writes the lock file of a repository.
 *
 * @internal
 */
export namespace RuleLockFile {

    /**
     * Returns the repository around a folder: the nearest folder with a Git checkout or an Nx workspace, or else the folder.
     *
     * @param start The folder.
     * @returns The folder of the repository.
     */
    export function repositoryOf(start: string): string {
        for (const directory of upwards(start)) {
            if (existsSync(join(directory, '.git')) || existsSync(join(directory, 'nx.json'))) {
                return directory;
            }
        }

        return start;
    }

    /**
     * Finds the directory whose lock file applies to a folder: the nearest one, up to the root of the repository.
     *
     * @param start The folder.
     * @returns The directory, or `null` when no lock file applies.
     */
    export function findDirectory(start: string): string | null {
        for (const directory of upwards(start)) {
            if (existsSync(join(directory, LOCK_FILE_NAME)) || existsSync(join(directory, LEGACY_LOCK_FILE_NAME))) {
                return directory;
            }

            if (existsSync(join(directory, '.git')) || existsSync(join(directory, 'nx.json'))) {
                return null;
            }
        }

        return null;
    }

    /**
     * Reads the lock file of a directory, with its fallback.
     *
     * @param directory The directory.
     * @returns What it says.
     */
    export function read(directory: string): ILockFileState {
        const current = join(directory, LOCK_FILE_NAME);
        const legacy = join(directory, LEGACY_LOCK_FILE_NAME);
        const path = existsSync(current) || !existsSync(legacy) ? current : legacy;
        const empty: RuleLock = { schemaVersion: 1, packs: {} };

        if (!existsSync(path)) {
            return { path, exists: false, lock: empty, problem: null };
        }

        if (statSync(path).size > MAX_LOCK_BYTES) {
            return { path, exists: true, lock: empty, problem: `The file is larger than ${MAX_LOCK_BYTES} bytes.` };
        }

        try {
            const parsed = RuleLockSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));

            return parsed.success
                ? { path, exists: true, lock: parsed.data, problem: null }
                : { path, exists: true, lock: empty, problem: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
        } catch (error) {
            return { path, exists: true, lock: empty, problem: `It is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    /**
     * Writes a lock in one spelling, so a change of it is a small diff.
     *
     * @param lock The lock.
     * @returns The text of the file.
     */
    export function print(lock: RuleLock): string {
        const sorted = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

        return `${JSON.stringify({
            schemaVersion: lock.schemaVersion,
            packs: sorted(Object.fromEntries(Object.entries(lock.packs).map(([id, entry]) => [id, { ...entry, rules: sorted(entry.rules) }])))
        }, null, 2)}\n`;
    }

    /**
     * @private
     */
    function* upwards(start: string): Generator<string> {
        let directory = start;
        const { root } = parsePath(start);

        for (;;) {
            yield directory;

            if (directory === root || dirname(directory) === directory) {
                return;
            }

            directory = dirname(directory);
        }
    }

}
