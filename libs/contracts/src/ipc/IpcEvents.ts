// #region Imports

import { z } from 'zod';
import { RunCommandNameSchema } from '../common/CommandName.js';
import { RunStateSchema } from '../runs/RunRecord.js';
import { ActiveRunSchema } from './dto/CommandDtos.js';
import { FolderSelectionSchema, IdSchema } from './dto/ShellDtos.js';

// #endregion

/**
 * What main tells the renderer on its own. A dropped folder arrives as a token, a folder that cannot be used as a message,
 * and a run as it goes on. Long runs live in main, so a renderer that reloads simply listens again.
 *
 * @public
 */
export const IpcEventSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('folder.dropped'), folder: FolderSelectionSchema }),
    z.strictObject({ type: z.literal('folder.dropFailed'), message: z.string().max(2000) }),
    z.strictObject({ type: z.literal('run.started'), run: ActiveRunSchema }),
    z.strictObject({
        type: z.literal('run.progress'),
        runId: IdSchema,
        phase: z.string(),
        completed: z.number().int()
            .nonnegative(),
        total: z.number().int()
            .nonnegative(),
        detail: z.string().nullable()
    }),
    z.strictObject({ type: z.literal('run.log'), runId: IdSchema, lines: z.array(z.string()) }),
    z.strictObject({
        type: z.literal('run.finished'),
        runId: IdSchema,
        command: RunCommandNameSchema,
        projectId: IdSchema,
        state: RunStateSchema,
        failure: z.string().nullable()
    }),
    z.strictObject({ type: z.literal('run.batchUpdated'), batchId: IdSchema }),
    z.strictObject({ type: z.literal('changes.updated') }),

    // Another process, such as the MCP server, recorded a run.
    z.strictObject({ type: z.literal('runs.updated') }),
    z.strictObject({ type: z.literal('generate.updated'), runId: IdSchema }),
    z.strictObject({ type: z.literal('test.translationUpdated'), id: IdSchema }),
    z.strictObject({ type: z.literal('ai.providersChanged') })
]);

/**
 * @public
 */
export type IpcEvent = z.output<typeof IpcEventSchema>;
