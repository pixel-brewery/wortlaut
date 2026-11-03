// #region Imports

import { z } from 'zod';
import { ChangeSetSummarySchema } from '../changes/ChangeSet.js';
import { FindingSchema } from '../common/Finding.js';
import { WriteModeSchema } from '../common/WriteMode.js';
import { RunStateSchema } from '../runs/RunRecord.js';

// #endregion

/**
 * What a command returns to scripts and CI. It is JSON-safe, holds no engine objects and no secrets; `wortlaut --json`
 * prints exactly this.
 *
 * @public
 */
export const CommandReportSchema = z.strictObject({
    ok: z.literal(true),
    command: z.string(),

    /**
     * The id of the run, or `null` for a command that records none.
     */
    runId: z.string().nullable(),

    state: RunStateSchema,
    writeMode: WriteModeSchema.nullable(),
    changeSet: ChangeSetSummarySchema.nullable(),
    findings: z.array(FindingSchema),
    data: z.unknown()
});

/**
 * @public
 */
export type CommandReport = z.output<typeof CommandReportSchema>;

/**
 * What a failed command prints with `--json`.
 *
 * @public
 */
export const CommandFailureReportSchema = z.strictObject({
    ok: z.literal(false),
    command: z.string(),
    error: z.strictObject({
        code: z.string(),
        message: z.string(),
        files: z.array(z.string()),

        /**
         * The pending change set that holds the finished work of a failed or stopped run.
         */
        changeSetId: z.string().nullable(),

        runId: z.string().nullable()
    })
});

/**
 * @public
 */
export type CommandFailureReport = z.output<typeof CommandFailureReportSchema>;
