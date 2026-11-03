// #region Imports

import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// #endregion

/**
 * Writes a private file of the profile so that readers in other processes see the old file or the new one, never a part.
 *
 * @internal
 * @param path The path of the file.
 * @param content The content.
 */
export function writePrivateFileAtomically(path: string, content: string): void {
    const directory = dirname(path);
    const temporary = join(directory, `.${randomBytes(6).toString('hex')}.tmp`);

    mkdirSync(directory, { recursive: true, mode: 0o700 });

    try {
        writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flush: true });
        renameSync(temporary, path);
    } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
}

/**
 * Creates an id that sorts by its instant and stays unique between processes, usable as a file name.
 *
 * @internal
 * @param now The instant.
 * @returns The id.
 */
export function createSortableId(now: Date): string {
    return `${now.toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`;
}
