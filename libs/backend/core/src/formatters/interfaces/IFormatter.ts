/**
 * Represents the result of a formatter operation.
 *
 * @public
 */
export interface IFormatterResult {
  content: string;
  changes: Record<string, string>;
}

/**
 * Interface for formatters that convert extracted strings into specific formats.
 *
 * @public
 */
export interface IFormatter {
  /**
   * Formats extracted strings into a desired format.
   *
   * @param strings The extracted strings as key-value pairs.
   * @returns The formatted output.
   */
  format(strings: Record<string, string>): IFormatterResult;
}
