// #region Imports

import { z } from 'zod';
import { RunCommandNameSchema } from '../../common/CommandName.js';
import { SurfaceSchema } from '../../common/Surface.js';
import { RunStateSchema } from '../../runs/RunRecord.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * A run in a list.
 *
 * @public
 */
export const RunSummarySchema = z.strictObject({
    id: IdSchema,
    title: z.string(),
    command: RunCommandNameSchema,
    state: RunStateSchema,
    surface: SurfaceSchema,

    /**
     * The assistant behind a run through MCP, as a person reads its name.
     */
    client: z.string().nullable(),
    dryRun: z.boolean(),

    /**
     * The change set waits in Review instead of having been written.
     */
    forReview: z.boolean(),

    /**
     * Whether the run can start again from its stored options.
     */
    canRepeat: z.boolean(),
    startedAt: z.iso.datetime(),
    detail: z.string(),

    /**
     * The rules that failed in an analysis that itself ran fine.
     */
    failedRules: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type RunSummary = z.output<typeof RunSummarySchema>;

/**
 * What a run did to a file.
 *
 * @public
 */
export const RunChangeSchema = z.strictObject({
    file: z.string(),
    action: z.enum(['create', 'update']),
    state: z.enum(['proposed', 'pending', 'applied', 'discarded'])
});

/**
 * @public
 */
export type RunChange = z.output<typeof RunChangeSchema>;

/**
 * Everything the details of a run show. Options come from the run record, which holds no secrets.
 *
 * @public
 */
export const RunDetailSchema = RunSummarySchema.extend({
    durationMs: z.number().int()
        .nonnegative(),
    equivalentCommand: z.string(),

    /**
     * The same command as it fits on a screen. Only `equivalentCommand` is meant to run.
     */
    equivalentCommandShown: z.string(),
    log: z.string(),
    droppedLogEntries: z.number().int()
        .nonnegative(),
    changes: z.array(RunChangeSchema),
    configuration: z.string(),
    failure: z.string().nullable()
});

/**
 * @public
 */
export type RunDetail = z.output<typeof RunDetailSchema>;
