// #region Imports

import { z } from 'zod';

// #endregion

/**
 * What a command does with its change set: `apply` writes it straight away, `review` leaves it pending in the review
 * list and `dry-run` only reports it.
 *
 * @public
 */
export const WriteModeSchema = z.enum(['apply', 'review', 'dry-run']);

/**
 * @public
 */
export type WriteMode = z.output<typeof WriteModeSchema>;
