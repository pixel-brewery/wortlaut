// #region Imports

import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// #endregion

/**
 * What Windows answers for as long as another program, such as a virus scanner, holds a file it has just seen.
 */
const BUSY_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);

/**
 * The pauses before each further attempt, about one and a half seconds in all.
 */
const BUSY_PAUSES_MS = [50, 100, 200, 400, 800];

/**
 * Renames a file over another one. On Windows that fails for as long as another program holds the target, and that passes.
 *
 * @internal
 * @param from The file to rename.
 * @param to The path it gets.
 * @param platform The platform, for a test.
 */
export function renameOver(
  from: string,
  to: string,
  platform: NodeJS.Platform = process.platform,
): void {
  for (const pause of platform === 'win32' ? BUSY_PAUSES_MS : []) {
    try {
      renameSync(from, to);

      return;
    } catch (error) {
      if (!BUSY_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }

      const until = Date.now() + pause;

      while (Date.now() < until) {
        // Every caller is synchronous, and the main thread of the desktop app is one of them.
      }
    }
  }

  renameSync(from, to);
}

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
    renameOver(temporary, path);
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
