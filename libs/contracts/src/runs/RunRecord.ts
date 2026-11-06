// #region Imports

import { z } from 'zod';
import { ChangeSetSummarySchema } from '../changes/ChangeSet.js';
import { RunCommandNameSchema } from '../common/CommandName.js';
import { FindingSchema } from '../common/Finding.js';
import { findSecretNames } from '../common/Secrets.js';
import { SurfaceSchema } from '../common/Surface.js';
import { WriteModeSchema } from '../common/WriteMode.js';

// #endregion

/**
 * How a run ended.
 *
 * @public
 */
export const RunStateSchema = z.enum(['succeeded', 'failed', 'stopped']);

/**
 * @public
 */
export type RunState = z.output<typeof RunStateSchema>;

/**
 * One line of a run's log, without terminal colors.
 *
 * @public
 */
export const RunLogEntrySchema = z.strictObject({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
});

/**
 * @public
 */
export type RunLogEntry = z.output<typeof RunLogEntrySchema>;

/**
 * Why a run failed, in the shape that surfaces can show.
 *
 * @public
 */
export const RunFailureSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  files: z.array(z.string()),
});

/**
 * @public
 */
export type RunFailure = z.output<typeof RunFailureSchema>;

/**
 * What Recent activity shows about a run that an assistant started through MCP.
 *
 * @public
 */
export const RunAssistantSchema = z.strictObject({
  /**
   * The name the client gave itself. It is a label and decides nothing.
   */
  client: z.string().max(128),

  /**
   * The tool it called.
   */
  tool: z.string().max(64),

  /**
   * What came of the call, in a few words.
   */
  result: z.string().max(400),
});

/**
 * @public
 */
export type RunAssistant = z.output<typeof RunAssistantSchema>;

/**
 * The record of one run. Instants are UTC; the options are the ones the command ran with, without secrets, so the run
 * can be repeated. One record is one file, so several processes can write at the same time.
 *
 * @public
 */
export const RunRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    command: RunCommandNameSchema,
    surface: SurfaceSchema,
    state: RunStateSchema,
    writeMode: WriteModeSchema,
    dryRun: z.boolean(),
    cwd: z.string(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    options: z.record(z.string(), z.unknown()),
    log: z.array(RunLogEntrySchema),

    /**
     * How many log entries the bound on the log dropped.
     */
    droppedLogEntries: z.number().int().nonnegative(),

    findings: z.array(FindingSchema),

    /**
     * The rules an analysis really ran, so a rule that found nothing can be told from one that did not run.
     */
    executedRules: z.array(z.string()).optional(),

    /**
     * The client and the tool, for a run an assistant started through MCP.
     */
    assistant: RunAssistantSchema.optional(),

    changeSet: ChangeSetSummarySchema.nullable(),
    failure: RunFailureSchema.nullable(),
  })
  .superRefine((record, context) => {
    for (const name of findSecretNames(record.options)) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `A run must not hold the secret option '${name}'.`,
      });
    }
  });

/**
 * @public
 */
export type RunRecord = z.output<typeof RunRecordSchema>;
