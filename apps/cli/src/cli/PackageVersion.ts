// #region Imports

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// #endregion

/**
 * The version of this package, read from its manifest beside `dist`.
 *
 * @internal
 * @returns The version.
 */
export function packageVersion(): string {
    return (JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }).version;
}
