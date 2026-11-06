// #region Imports

import { randomUUID } from 'node:crypto';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { DisplayPath, PathResolver } from '@pixel-brewery/wortlaut-engine';
import type { FolderSelection } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The most folders that stay granted, so a long session cannot grow without bound.
 */
const MAX_GRANTS = 256;

/**
 * The folders the user chose in a native dialog or dropped on the app. A renderer holds only their tokens: it cannot name
 * a path, and whatever it names by token is a folder the user picked.
 *
 * @public
 */
export class FolderGrants {
  // #region Fields

  private readonly _home: string;
  private readonly _grants: Map<string, string>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `FolderGrants` class.
   *
   * @param home The home directory, for display paths.
   */
  public constructor(home: string) {
    this._home = home;
    this._grants = new Map();
  }

  // #endregion

  // #region Methods

  /**
   * Grants a folder after checking that it is a readable directory. Links are resolved first, so a later check that a
   * folder stays inside another compares where they really are.
   *
   * @param path The path of the folder.
   * @param insideToken A folder that it must lie inside.
   * @returns The selection for the renderer.
   * @throws Error with a message for the user when the path is no readable folder or lies outside.
   */
  public grant(path: string, insideToken: string | null = null): FolderSelection {
    const folder = this.checkFolder(path);

    if (insideToken && !PathResolver.isInside(this.resolve(insideToken), folder)) {
      throw new Error('Choose a folder inside the project.');
    }

    const token = randomUUID();

    this._grants.set(token, folder);

    for (const oldest of this._grants.keys()) {
      if (this._grants.size <= MAX_GRANTS) {
        break;
      }

      this._grants.delete(oldest);
    }

    return { token, displayPath: DisplayPath.of(folder, this._home), name: basename(folder) };
  }

  /**
   * Returns the folder behind a token.
   *
   * @param token The token.
   * @returns The absolute path.
   * @throws Error when the token was not handed out by this app.
   */
  public resolve(token: string): string {
    const folder = this._grants.get(token);

    if (!folder) {
      throw new Error('This folder is no longer available. Choose it again.');
    }

    return folder;
  }

  /**
   * Returns the folder behind a token that must lie inside another granted folder.
   *
   * @param token The token.
   * @param insideToken The other folder.
   * @returns The absolute path.
   * @throws Error when the token is unknown or the folder lies outside.
   */
  public resolveInside(token: string, insideToken: string): string {
    const folder = this.resolve(token);

    if (!PathResolver.isInside(this.resolve(insideToken), folder)) {
      throw new Error('Choose a folder inside the project.');
    }

    return folder;
  }

  /**
   * @private
   */
  private checkFolder(path: string): string {
    let folder: string;

    try {
      folder = realpathSync(path);
      accessSync(folder, constants.R_OK);
    } catch {
      throw new Error('This folder cannot be read.');
    }

    if (!statSync(folder).isDirectory()) {
      throw new Error('That is a file. Choose a folder.');
    }

    return folder;
  }

  // #endregion
}
