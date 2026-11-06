// #region Imports

import { relative, resolve, sep } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { PathResolver } from './PathResolver.js';

// #endregion

/**
 * Turns absolute paths into what the user may see. A renderer holds paths only in this form.
 *
 * @public
 */
export namespace DisplayPath {
  /**
   * Returns a path for showing: below the home directory it starts with `~`.
   *
   * @public
   * @param path The absolute path.
   * @param home The home directory.
   * @returns The path to show.
   */
  export function of(path: string, home: string): string {
    return PathResolver.isInside(home, path)
      ? toForwardSlashes(`~${sep}${relative(home, path)}`).replace(/\/$/, '')
      : toForwardSlashes(path);
  }

  /**
   * Returns a path relative to a directory, with forward slashes.
   *
   * @public
   * @param base The directory.
   * @param path The path.
   * @returns The relative path, or `.` for the directory itself.
   */
  export function relativeTo(base: string, path: string): string {
    return toForwardSlashes(relative(resolve(base), resolve(base, path))) || '.';
  }

  /**
   * Makes the text of a failure safe to show: it holds no terminal colors, and the home directory reads `~`.
   *
   * @public
   * @param text The text.
   * @param home The home directory.
   * @returns The text to show.
   */
  export function scrub(text: string, home: string): string {
    return stripVTControlCharacters(text).split(home).join('~');
  }

  /**
   * @private
   */
  function toForwardSlashes(path: string): string {
    return path.split(sep).join('/');
  }
}
