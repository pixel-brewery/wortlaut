// #region Imports

import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { IPackFile } from './PackArchive.js';
import { PACK_LIMITS } from './PackLimits.js';
import { PackProblem } from './PackProblem.js';

// #endregion

/**
 * What a folder may hold that is no part of its pack.
 */
const LEFT_OUT = new Set(['.git', 'node_modules']);

/**
 * Reads the files of a pack from a folder, under the same bounds as an archive. A link is refused, so a pack cannot point at a
 * file outside of itself.
 *
 * @internal
 * @param folder The folder.
 * @returns The files, relative to the folder.
 * @throws PackProblem for a folder that does not exist, is too big or holds a link.
 */
export function readPackFolder(folder: string): Array<IPackFile> {
  let root: string;

  try {
    root = realpathSync(folder);

    if (!lstatSync(root).isDirectory()) {
      throw new Error('No folder.');
    }
  } catch {
    throw new PackProblem('not-found', `The folder ${folder} does not exist.`);
  }

  const files = new Array<IPackFile>();
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;

      if (entry.isSymbolicLink()) {
        throw new PackProblem('unsafe', `This pack holds a link, which Wortlaut refuses: ${path}`);
      }

      if (entry.isDirectory()) {
        if (!LEFT_OUT.has(entry.name)) {
          visit(join(directory, entry.name), `${path}/`);
        }
      } else if (entry.isFile()) {
        files.push({ path, bytes: readBounded(join(directory, entry.name), path) });

        if (files.length > PACK_LIMITS.maxFiles) {
          throw new PackProblem(
            'too-large',
            `This pack holds more than ${PACK_LIMITS.maxFiles} files.`,
          );
        }
      } else {
        throw new PackProblem(
          'unsafe',
          `This pack holds a special file, which Wortlaut refuses: ${path}`,
        );
      }
    }
  };

  visit(root, '');

  return files;
}

/**
 * Reads a file only after looking at its size.
 *
 * @internal
 * @param file The file.
 * @param path Its name for a message.
 * @returns The bytes.
 * @throws PackProblem for a file that is too large.
 */
export function readBounded(file: string, path: string): Buffer {
  if (lstatSync(file).size > PACK_LIMITS.maxFileBytes) {
    throw new PackProblem(
      'too-large',
      `The file ${path} of this pack is larger than ${PACK_LIMITS.maxFileBytes} bytes.`,
    );
  }

  return readFileSync(file);
}
