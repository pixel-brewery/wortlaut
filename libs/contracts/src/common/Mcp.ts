// #region Imports

import { z } from 'zod';

// #endregion

/**
 * What assistants may do through the MCP server: look, also suggest, or also write. The user sets it in the app, and no
 * argument of a tool or of the server can raise it.
 *
 * @public
 */
export const McpLevelSchema = z.enum(['read', 'propose', 'write']);

/**
 * @public
 */
export type McpLevel = z.output<typeof McpLevelSchema>;

/**
 * Returns whether a level allows what a tool needs.
 *
 * @public
 * @param level The active level.
 * @param needed The level a tool needs.
 * @returns `true` when the tool may run.
 */
export function mcpLevelAllows(level: McpLevel, needed: McpLevel): boolean {
    const rank = McpLevelSchema.options;

    return rank.indexOf(level) >= rank.indexOf(needed);
}

/**
 * Reads the name an MCP client gives itself, as a person reads it. The name is whatever a client claims, so it only ever
 * labels a run and decides nothing.
 *
 * @public
 * @param name The name from the client's handshake.
 * @returns For example `Claude Code`, `Codex` or the name as it came.
 */
export function mcpClientName(name: string): string {
    const lower = name.toLowerCase();

    if (lower.startsWith('claude')) {
        return 'Claude Code';
    }

    return lower.startsWith('codex') ? 'Codex' : name;
}
