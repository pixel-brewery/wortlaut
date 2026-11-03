// #region Imports

import { z } from 'zod';
import { McpLevelSchema } from '../../common/Mcp.js';
import { RunStateSchema } from '../../runs/RunRecord.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * Sets what assistants may do.
 *
 * @public
 */
export const McpLevelRequestSchema = z.strictObject({ level: McpLevelSchema });

/**
 * What the MCP screen says about the server. No process runs in the app: the server starts when an assistant connects.
 *
 * @public
 */
export const McpStatusSchema = z.strictObject({

    /**
     * What assistants may do. Without a level the server is read only, so this says `read` then.
     */
    level: McpLevelSchema,

    /**
     * The command that starts the server on this computer, as it can be pasted into a terminal.
     */
    command: z.string(),

    /**
     * Whether that command can start.
     */
    ready: z.boolean(),

    /**
     * Why it cannot.
     */
    problem: z.string().nullable()
});

/**
 * @public
 */
export type McpStatus = z.output<typeof McpStatusSchema>;

/**
 * One step of connecting an assistant, with what to paste.
 *
 * @public
 */
export const McpStepSchema = z.strictObject({
    title: z.string(),
    code: z.string()
});

/**
 * @public
 */
export type McpStep = z.output<typeof McpStepSchema>;

/**
 * One way to connect an assistant.
 *
 * @public
 */
export const McpClientSchema = z.strictObject({
    id: z.enum(['claude-code', 'codex', 'other']),
    label: z.string(),

    /**
     * What is known about it on this computer, found without reading its setup or its account.
     */
    state: z.string(),
    variant: z.enum(['success', 'neutral']),
    about: z.string(),
    steps: z.array(McpStepSchema)
});

/**
 * @public
 */
export type McpClient = z.output<typeof McpClientSchema>;

/**
 * One tool of the server with the level it needs.
 *
 * @public
 */
export const McpToolSchema = z.strictObject({
    id: z.string(),
    description: z.string(),
    level: McpLevelSchema
});

/**
 * @public
 */
export type McpTool = z.output<typeof McpToolSchema>;

/**
 * What an assistant did, for Recent activity.
 *
 * @public
 */
export const McpActivitySchema = z.strictObject({
    runId: IdSchema,
    tool: z.string(),
    client: z.string(),
    result: z.string(),
    state: RunStateSchema,
    startedAt: z.iso.datetime()
});

/**
 * @public
 */
export type McpActivity = z.output<typeof McpActivitySchema>;
