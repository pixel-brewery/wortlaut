// #region Imports

import { readFileSync } from 'node:fs';
import { AppSettingsSchema, type AppSettings } from '@pixel-brewery/wortlaut-contracts';
import { writePrivateFileAtomically } from '@pixel-brewery/wortlaut-engine';

// #endregion

/**
 * What the app starts with. Dry run is on, and the color mode follows the system until the user picks one.
 *
 * @public
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  startInDryRun: true,
  verboseLog: false,
  cacheResults: true,
  colorMode: null,
};

/**
 * Settings: application, in a file of the user's profile. A file that cannot be read is the same as none, because a setting is never
 * a reason for the app not to start.
 *
 * @public
 */
export class AppSettingsStore {
  // #region Fields

  private readonly _path: string | null;
  private _current: AppSettings | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `AppSettingsStore` class.
   *
   * @param path The file, or `null` to keep the settings in memory.
   */
  public constructor(path: string | null) {
    this._path = path;
    this._current = null;
  }

  // #endregion

  // #region Methods

  /**
   * Returns the settings.
   *
   * @returns The settings.
   */
  public read(): AppSettings {
    this._current ??= this.load();

    return this._current;
  }

  /**
   * Keeps new settings.
   *
   * @param settings The settings.
   */
  public write(settings: AppSettings): void {
    this._current = settings;

    if (this._path) {
      writePrivateFileAtomically(this._path, `${JSON.stringify(settings, null, 2)}\n`);
    }
  }

  /**
   * @private
   */
  private load(): AppSettings {
    if (!this._path) {
      return DEFAULT_APP_SETTINGS;
    }

    try {
      return AppSettingsSchema.parse(JSON.parse(readFileSync(this._path, 'utf8')));
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }

  // #endregion
}
