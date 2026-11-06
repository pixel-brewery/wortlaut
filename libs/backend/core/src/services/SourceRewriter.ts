/**
 * One replacement in a source file. The position comes from a detector and names the value as the source spells it.
 *
 * @public
 */
export interface ISourceEdit {
  /**
   * The line of the value, starting at 1.
   */
  line: number;

  /**
   * Where the value starts in its line.
   */
  start: number;

  /**
   * Where the value ends in its line.
   */
  end: number;

  /**
   * What the line must hold there.
   */
  raw: string;

  /**
   * What goes in its place.
   */
  replacement: string;
}

/**
 * Replaces detected values in a source, each at its position and nothing else. Line endings and everything around the
 * values stay as they are.
 *
 * @public
 * @param content The content of the source file.
 * @param edits The replacements. Several may fall into one line.
 * @returns The new content.
 * @throws Error when a line no longer holds what a detector found there.
 */
export function rewriteSource(content: string, edits: ReadonlyArray<ISourceEdit>): string {
  const lines = content.split('\n');
  const rightToLeft = [...edits].sort((a, b) => a.line - b.line || b.start - a.start);

  for (const edit of rightToLeft) {
    const line = lines[edit.line - 1];

    if (line?.slice(edit.start, edit.end) !== edit.raw) {
      throw new Error(`Line ${edit.line} no longer holds '${edit.raw}'.`);
    }

    lines[edit.line - 1] = `${line.slice(0, edit.start)}${edit.replacement}${line.slice(edit.end)}`;
  }

  return lines.join('\n');
}
