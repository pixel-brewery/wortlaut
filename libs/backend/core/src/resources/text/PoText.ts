/**
 * Writes the text of PO entries the way `Po.parse` of `@pixel-brewery/utilities` reads it, so a value that holds a quote, a
 * backslash or a line break comes back as it went in.
 *
 * @public
 */
export namespace PoText {
  /**
   * Escapes a value for a quoted PO string.
   *
   * @public
   * @param value The value.
   * @returns The text between the quotes.
   */
  export function escape(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r\n|\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Writes the comment of an entry as comment lines. A line that already is a comment keeps its kind, such as `#.` or `#,`.
   *
   * @public
   * @param comment The comment.
   * @returns The lines.
   */
  export function commentLines(comment: string): Array<string> {
    return comment
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith('#') ? line : `# ${line}`));
  }

  /**
   * Returns the words of a comment, without the marks of its lines.
   *
   * @public
   * @param comment The comment as a reader returns it.
   * @returns The text.
   */
  export function commentText(comment: string): string {
    return comment
      .split(/\r?\n/)
      .map((line) => line.replace(/^#[.,|]?\s?/, '').trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  /**
   * Returns the header entry of a catalog of a locale. Without it, tools read a value beyond ASCII in the wrong charset.
   *
   * @public
   * @param locale The locale.
   * @returns The value of the entry with the empty `msgid`.
   */
  export function header(locale: string): string {
    return `Content-Type: text/plain; charset=UTF-8\n${locale ? `Language: ${locale}\n` : ''}`;
  }
}
