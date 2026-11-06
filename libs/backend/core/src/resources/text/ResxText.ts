// #region Imports

import type { IResxEntry } from '@pixel-brewery/utilities';

// #endregion

/**
 * What a RESX file starts with.
 */
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * Writes RESX files with the layout and the escapes `CatalogEditor` uses for a single entry, so a catalog looks the same
 * whichever of the two wrote it last.
 *
 * @public
 */
export namespace ResxText {
  /**
   * Writes entries as a RESX file, in the order they have.
   *
   * @public
   * @param entries The entries.
   * @returns The text.
   */
  export function serialize(entries: ReadonlyArray<IResxEntry>): string {
    const blocks = entries.map((entry) =>
      [
        `  <data name="${escape(entry.key)}" xml:space="preserve">`,
        `    <value>${escape(entry.value)}</value>`,
        ...(entry.comment ? [`    <comment>${escape(entry.comment)}</comment>`] : []),
        '  </data>',
      ].join('\n'),
    );

    return [DECLARATION, '<root>', ...blocks, '</root>'].join('\n');
  }

  /**
   * @private
   */
  function escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
