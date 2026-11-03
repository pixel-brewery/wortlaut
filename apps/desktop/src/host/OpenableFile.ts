// #region Imports

import { extname } from 'node:path';

// #endregion

/**
 * What a system shows when it opens a file. A repository decides what its files are called, and every other type may
 * open by running, such as `.js` through the Windows Script Host, `.command` in a terminal or `.app` by itself.
 */
const DOCUMENTS = new Set(['.cs', '.cshtml', '.css', '.htm', '.html', '.json', '.md', '.mts', '.po', '.pot', '.razor', '.resx', '.scss', '.svelte', '.ts', '.tsx', '.txt', '.vue', '.xlf', '.xliff', '.xml', '.yaml', '.yml']);

/**
 * Returns whether opening a file shows it rather than runs it.
 *
 * @public
 * @param path The path of the file, with its links resolved.
 * @returns `true` for a document.
 */
export function opensWithoutRunning(path: string): boolean {
    return DOCUMENTS.has(extname(path).toLowerCase());
}
