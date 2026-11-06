// #region Imports

import { z } from 'zod';

// #endregion

/**
 * The progress of a running command, reported as an event.
 *
 * @public
 */
export const RunProgressEventSchema = z.strictObject({
  runId: z.string(),
  phase: z.string(),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  detail: z.string().nullable(),
});

/**
 * @public
 */
export type RunProgressEvent = z.output<typeof RunProgressEventSchema>;
