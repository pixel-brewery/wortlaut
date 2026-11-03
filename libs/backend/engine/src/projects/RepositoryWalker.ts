// #region Imports

import { readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

// #endregion

/**
 * Folders that hold no project sources: tools, dependencies and build output.
 */
const SKIPPED_FOLDERS = new Set(['bin', 'build', 'coverage', 'dist', 'node_modules', 'obj', 'out', 'target', 'temp', 'tmp', 'vendor']);

/**
 * The most entries one walk looks at, so a very big repository stays usable.
 */
const MAX_ENTRIES = 100_000;

/**
 * The deepest folder one walk goes into.
 */
const MAX_DEPTH = 12;

/**
 * What a walk found.
 *
 * @internal
 */
export interface IRepositoryContent {

    /**
     * The absolute paths of all files.
     */
    files: Array<string>;

    /**
     * Whether the walk stopped at its bound.
     */
    truncated: boolean;
}

/**
 * Lists the files of a folder within fixed bounds. Hidden and generated folders are left out, and a symbolic link is
 * not followed, so a walk stays inside the folder the user chose.
 *
 * @internal
 * @param root The absolute path of the folder.
 * @param maxEntries The most entries to look at.
 * @returns What the walk found. A folder that cannot be read counts as empty.
 */
export function walkRepository(root: string, maxEntries: number = MAX_ENTRIES): IRepositoryContent {
    const files = new Array<string>();
    const pending: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
    let seen = 0;
    let truncated = false;

    while (pending.length > 0) {
        const { directory, depth } = pending.shift() as { directory: string; depth: number };

        for (const entry of readEntries(directory)) {
            seen++;

            if (seen > maxEntries) {
                return { files, truncated: true };
            }

            if (entry.isFile()) {
                files.push(join(directory, entry.name));
            } else if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_FOLDERS.has(entry.name)) {
                if (depth + 1 > MAX_DEPTH) {
                    truncated = true;
                } else {
                    pending.push({ directory: join(directory, entry.name), depth: depth + 1 });
                }
            }
        }
    }

    return { files, truncated };
}

/**
 * @private
 */
function readEntries(directory: string): Array<Dirent> {
    try {
        return readdirSync(directory, { withFileTypes: true });
    } catch {
        return [];
    }
}
