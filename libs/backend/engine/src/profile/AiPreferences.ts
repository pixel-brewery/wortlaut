// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { writePrivateFileAtomically } from '../io/AtomicFile.js';

// #endregion

/**
 * What the profile keeps about AI. Logins and keys belong to the computer, so the default provider lives here and not in a
 * repository. It never holds a key.
 *
 * @public
 */
export class AiPreferences {
  // #region Fields

  private readonly _file: string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `AiPreferences` class.
   *
   * @public
   * @param file The file in the profile.
   */
  public constructor(file: string) {
    this._file = file;
  }

  // #endregion

  // #region Properties

  /**
   * Gets the default provider, or `null` when none was chosen.
   *
   * @public
   */
  public get defaultProvider(): string | null {
    try {
      if (!existsSync(this._file)) {
        return null;
      }

      const value = (JSON.parse(readFileSync(this._file, 'utf8')) as { defaultProvider?: unknown })
        .defaultProvider;

      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  public set defaultProvider(value: string | null) {
    writePrivateFileAtomically(
      this._file,
      `${JSON.stringify({ defaultProvider: value }, null, 2)}\n`,
    );
  }

  // #endregion
}
