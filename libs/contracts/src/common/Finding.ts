// #region Imports

import { z } from 'zod';

// #endregion

/**
 * The severity of a finding.
 *
 * @public
 */
export const FindingSeveritySchema = z.enum(['info', 'warning', 'error']);

/**
 * Something a command noticed, in the one shape that runs and change sets share.
 *
 * @public
 */
export const FindingSchema = z.strictObject({
  rule: z.string(),
  severity: FindingSeveritySchema,
  message: z.string(),
  file: z.string().nullable(),
  locale: z.string().nullable(),

  /**
   * How many things the finding is about, such as unused keys, when a rule counts them.
   */
  count: z.number().int().nonnegative().optional(),
});

/**
 * @public
 */
export type Finding = z.output<typeof FindingSchema>;
