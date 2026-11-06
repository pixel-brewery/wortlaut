// #region Imports

import type { IFormatter, IFormatterResult } from './interfaces/IFormatter.js';

// #endregion

/**
 * Formatter for outputting extracted strings in JSON format.
 *
 * @public
 */
export class JsonFormatter implements IFormatter {
  // #region Fields

  private readonly _indent: number;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `JsonFormatter` class.
   *
   * @public
   */
  public constructor(options?: { indent: number }) {
    this._indent = options?.indent ?? 2;
  }

  // #endregion

  // #region Methods

  /**
   * Formats extracted strings into a JSON format.
   *
   * @public
   * @param strings The extracted strings as key-value pairs.
   * @returns The formatted output as a JSON string.
   */
  public format(strings: Record<string, string>): IFormatterResult {
    const content = JSON.stringify(strings, null, this._indent);

    return {
      content: content,
      changes: strings,
    };
  }

  // #endregion
}
