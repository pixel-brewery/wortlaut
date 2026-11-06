// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { CatalogEditor, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import type { TranslationSession } from './TranslationSession.js';

// #endregion

/**
 * A target file with the text it would get.
 *
 * @internal
 */
export interface IComposedTarget {
  path: string;
  content: string;
  keys: ReadonlyArray<string>;
}

/**
 * Works out what the accepted rows of a session would make of their target files. A catalog keeps its order and formatting
 * and the keys that are not part of the run. A new one takes after its base catalog.
 *
 * @internal
 * @param session The session.
 * @param locale The locale, or `null` for all.
 * @returns The targets.
 */
export async function composeTargets(
  session: TranslationSession,
  locale: string | null,
): Promise<Array<IComposedTarget>> {
  const targets = new Array<IComposedTarget>();

  for (const [path, { rows }] of session.acceptedRows(locale)) {
    const base = session.baseOf(path);
    const type = base.type as ResourceMode;
    const entries = rows.map((row) => [row.key, row.value] as const);

    targets.push({
      path,
      content: existsSync(path)
        ? CatalogEditor.setValues(readFileSync(path, 'utf8'), type, entries)
        : CatalogEditor.createLike(readFileSync(base.path, 'utf8'), type, entries),
      keys: rows.map((row) => row.key),
    });

    // A big catalog takes a moment, and main has other things to do.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }

  return targets;
}
