// #region Imports

import { comparePlaceholders, type IResourceModel } from '@pixel-brewery/wortlaut-core';

// #endregion

/**
 * What a check found in the answer to a chunk.
 *
 * @public
 */
export type ChunkIssueKind =
  | 'shape'
  | 'row-count'
  | 'unknown-key'
  | 'missing-key'
  | 'duplicate-key'
  | 'placeholder'
  | 'empty-value';

/**
 * One thing a reviewer should know about the answer to a chunk.
 *
 * @public
 */
export interface IChunkIssue {
  kind: ChunkIssueKind;
  key: string | null;
  message: string;
}

/**
 * A translated row, with what its value lacks.
 *
 * @public
 */
export interface IValidatedRow extends IResourceModel {
  /**
   * What is wrong with the value of this row. A row with a problem never reaches a catalog on its own.
   */
  readonly problem: string | null;
}

/**
 * The result of checking the answer to a chunk.
 *
 * @public
 */
export interface IChunkValidation {
  /**
   * `rejected` holds no usable row, `flagged` holds all keys with a row that has a problem, `clean` holds all keys.
   */
  status: 'clean' | 'flagged' | 'rejected';

  /**
   * One row per key of the chunk, in its order. Empty when rejected.
   */
  rows: Array<IValidatedRow>;
  issues: Array<IChunkIssue>;
}

/**
 * Reads what the placeholders of a translation lack, as a reviewer reads it.
 *
 * @public
 * @param base The base value.
 * @param value The translation.
 * @returns The message, or `null` when they match.
 */
export function describePlaceholderProblem(base: string, value: string): string | null {
  const { missing, added } = comparePlaceholders(base, value);

  if (missing.length > 0) {
    return `Placeholder ${missing[0]} is missing`;
  }

  return added.length > 0 ? `Placeholder ${added[0]} is not in the base value` : null;
}

/**
 * Checks the answer to a chunk. An answer is untrusted, so nothing of it is taken over unchecked: a row keeps the key and
 * the comment of the catalog, and only its value comes from the model.
 *
 * @public
 * @param expected The rows that were asked for.
 * @param answer What came back.
 * @returns The result.
 */
export function validateChunk(
  expected: ReadonlyArray<IResourceModel>,
  answer: unknown,
): IChunkValidation {
  if (!Array.isArray(answer)) {
    return reject({ kind: 'shape', key: null, message: 'The answer is no list of rows.' });
  }

  const values = new Map<string, string>();
  const known = new Set(expected.map((model) => model.key));
  const issues = new Array<IChunkIssue>();

  if (answer.length !== expected.length) {
    issues.push({
      kind: 'row-count',
      key: null,
      message: `It returned ${answer.length} rows for ${expected.length} keys.`,
    });
  }

  for (const row of answer as ReadonlyArray<unknown>) {
    const { key, value } = (typeof row === 'object' && row !== null ? row : {}) as {
      key?: unknown;
      value?: unknown;
    };

    if (typeof key !== 'string' || typeof value !== 'string') {
      return reject({
        kind: 'shape',
        key: null,
        message: 'A row has no key or no text as its value.',
      });
    }

    if (!known.has(key)) {
      issues.push({ kind: 'unknown-key', key, message: `The unknown key ${key} was dropped.` });
    } else if (values.has(key)) {
      issues.push({
        kind: 'duplicate-key',
        key,
        message: `The key ${key} came twice. The first row counts.`,
      });
    } else {
      values.set(key, value);
    }
  }

  const missing = expected.filter((model) => !values.has(model.key));

  if (missing.length > 0) {
    return {
      status: 'rejected',
      rows: [],
      issues: [
        ...issues,
        {
          kind: 'missing-key',
          key: missing[0].key,
          message: `${missing.length} of ${expected.length} keys are missing or changed, such as ${missing[0].key}.`,
        },
      ],
    };
  }

  const rows = expected.map((model): IValidatedRow => {
    const value = values.get(model.key) as string;

    return { key: model.key, value, comment: model.comment, problem: problemOf(model, value) };
  });

  for (const row of rows) {
    if (row.problem) {
      issues.push({
        kind: row.value === '' ? 'empty-value' : 'placeholder',
        key: row.key,
        message: `${row.key}: ${row.problem}`,
      });
    }
  }

  return { status: rows.some((row) => row.problem) ? 'flagged' : 'clean', rows, issues };
}

/**
 * @private
 */
function problemOf(model: IResourceModel, value: string): string | null {
  if (value === '' && String(model.value ?? '') !== '') {
    return 'The translation is empty';
  }

  return describePlaceholderProblem(String(model.value ?? ''), value);
}

/**
 * @private
 */
function reject(issue: IChunkIssue): IChunkValidation {
  return { status: 'rejected', rows: [], issues: [issue] };
}
