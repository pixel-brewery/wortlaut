// #region Imports

import { z } from 'zod';
import { PresetSchema } from '../../settings/ProjectOptions.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * What the detector tab of the test lab offers for a preset.
 *
 * @public
 */
export const TestPresetSchema = z.strictObject({
  id: PresetSchema,
  name: z.string(),
  samples: z.array(
    z.strictObject({
      fileName: z.string(),
      content: z.string(),
    }),
  ),
});

/**
 * @public
 */
export type TestPreset = z.output<typeof TestPresetSchema>;

/**
 * Asks what the detector finds in a text. Nothing is read from or written to the project.
 *
 * @public
 */
export const TestDetectRequestSchema = z.strictObject({
  projectId: IdSchema.nullable(),
  preset: PresetSchema,
  fileName: z.string().max(200),
  content: z.string().max(1048576),
});

/**
 * What the detector found.
 *
 * @public
 */
export const TestDetectResultSchema = z.strictObject({
  detector: z.string().nullable(),
  prefix: z.string(),
  matches: z.array(
    z.strictObject({
      line: z.number().int().positive(),
      column: z.number().int().nonnegative(),
      value: z.string(),
      isHardCoded: z.boolean(),
    }),
  ),
  resource: z.string(),

  /**
   * Why the detector could not work on this text.
   */
  failure: z.string().nullable(),
});

/**
 * @public
 */
export type TestDetectResult = z.output<typeof TestDetectResultSchema>;

/**
 * Asks which keys of the project a pattern covers, in the grammar of the list it would go into.
 *
 * @public
 */
export const TestPatternRequestSchema = z.strictObject({
  projectId: IdSchema,
  pattern: z.string().max(2000),
  list: z.enum(['usedKeys', 'identicalKeys']),
});

/**
 * Which keys a pattern covers.
 *
 * @public
 */
export const TestPatternResultSchema = z.strictObject({
  error: z.string().nullable(),
  matchCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),

  /**
   * The keys with their result, matches first, up to a bound.
   */
  keys: z.array(z.strictObject({ key: z.string(), isMatch: z.boolean() })),
});

/**
 * @public
 */
export type TestPatternResult = z.output<typeof TestPatternResultSchema>;
