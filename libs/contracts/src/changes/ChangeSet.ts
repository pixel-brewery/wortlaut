// #region Imports

import { z } from 'zod';
import { RunCommandNameSchema } from '../common/CommandName.js';
import { FindingSchema } from '../common/Finding.js';
import { findSecretNames } from '../common/Secrets.js';
import { SurfaceSchema } from '../common/Surface.js';

// #endregion

/**
 * The state of a change set. `proposed` is a dry run's result, which is never stored.
 *
 * @public
 */
export const ChangeSetStateSchema = z.enum(['proposed', 'pending', 'applied', 'discarded']);

/**
 * @public
 */
export type ChangeSetState = z.output<typeof ChangeSetStateSchema>;

/**
 * One file of a change set: what was read and what would be written.
 *
 * @public
 */
export const ChangeSetFileSchema = z.strictObject({
  /**
   * The absolute path of the file. Only the engine works with it; views show `displayPath`.
   */
  path: z.string().min(1),

  /**
   * The path to show, relative to the working directory of the run.
   */
  displayPath: z.string().min(1),

  action: z.enum(['create', 'update']),

  /**
   * The text that was read, or `null` when the file did not exist.
   */
  oldContent: z.string().nullable(),

  /**
   * The SHA-256 of the bytes that were read, or `null` when the file did not exist. Applying compares it again.
   */
  oldHash: z.string().nullable(),

  newContent: z.string(),

  /**
   * The SHA-256 of the UTF-8 bytes of `newContent`.
   */
  newHash: z.string(),
});

/**
 * @public
 */
export type ChangeSetFile = z.output<typeof ChangeSetFileSchema>;

/**
 * Where a change set comes from. It never holds an option value, so no secret can reach it through here.
 *
 * @public
 */
export const ChangeSetSourceSchema = z.strictObject({
  command: RunCommandNameSchema,
  surface: SurfaceSchema,
  runId: z.string(),
  detail: z.string().nullable(),
});

/**
 * @public
 */
export type ChangeSetSource = z.output<typeof ChangeSetSourceSchema>;

/**
 * A reviewable set of file writes. Every write in Wortlaut is one: applying it rechecks every file and writes all of it
 * or none of it.
 *
 * @public
 */
export const ChangeSetSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    state: ChangeSetStateSchema,

    /**
     * The instant the change set was built, in UTC.
     */
    createdAt: z.iso.datetime(),

    /**
     * The working directory of the run that built it.
     */
    cwd: z.string(),

    source: ChangeSetSourceSchema,
    files: z.array(ChangeSetFileSchema),
    findings: z.array(FindingSchema),

    /**
     * Set when the run failed or was stopped, so the set holds only what was finished by then.
     */
    partial: z.boolean(),
  })
  .superRefine((changeSet, context) => {
    for (const name of findSecretNames(changeSet.source)) {
      context.addIssue({
        code: 'custom',
        message: `A change set must not hold the secret option '${name}'.`,
      });
    }
  });

/**
 * @public
 */
export type ChangeSet = z.output<typeof ChangeSetSchema>;

/**
 * A change set without file contents, for lists, reports and run records.
 *
 * @public
 */
export const ChangeSetSummarySchema = z.strictObject({
  id: z.string(),
  state: ChangeSetStateSchema,
  createdAt: z.iso.datetime(),
  cwd: z.string(),
  source: ChangeSetSourceSchema,
  partial: z.boolean(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      displayPath: z.string(),
      action: z.enum(['create', 'update']),
    }),
  ),
  findingCount: z.number().int().nonnegative(),
});

/**
 * @public
 */
export type ChangeSetSummary = z.output<typeof ChangeSetSummarySchema>;
