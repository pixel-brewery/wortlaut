// #region Imports

import { isSecretName, mcpLevelAllows, type McpLevel } from '@pixel-brewery/wortlaut-contracts';
import { DisplayPath, EngineError, SecretScrubber, type AssistantCommands } from '@pixel-brewery/wortlaut-engine';
import { z } from 'zod';
import type { McpLevelStore } from '../levels/McpLevelStore.js';
import { MCP_TOOLS, type IMcpTool } from '../tools/McpTools.js';

// #endregion

/**
 * The longest name of a client a run keeps.
 */
const MAX_CLIENT_NAME_LENGTH = 64;

/**
 * Shorter values of secret variables are no credentials.
 */
const MIN_SECRET_LENGTH = 8;

/**
 * The names of the levels, as the app says them.
 */
const LEVEL_NAMES: Readonly<Record<McpLevel, string>> = { read: 'Read only', propose: 'Propose changes', write: 'Write' };

/**
 * A tool as a client sees it.
 *
 * @public
 */
export interface IMcpListedTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean };
}

/**
 * What a call came to.
 *
 * @public
 */
export interface IMcpCallResult {
    isError: boolean;
    text: string;
}

/**
 * What the host is composed of.
 *
 * @public
 */
export interface IMcpToolHostInit {
    assistants: AssistantCommands;
    levels: McpLevelStore;
    cwd: string;
    home: string;

    /**
     * The environment, whose secrets stay out of every result.
     */
    env: NodeJS.ProcessEnv;
}

/**
 * Decides what a client may call, on every call, and hands the rest to the engine: it checks the level the user chose, validates
 * the input and keeps secrets out of the result. What a client says about itself decides nothing.
 *
 * @public
 */
export class McpToolHost {

    // #region Fields

    private readonly _init: IMcpToolHostInit;
    private readonly _scrubber: SecretScrubber;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `McpToolHost` class.
     *
     * @public
     * @param init What the host is composed of.
     */
    public constructor(init: IMcpToolHostInit) {
        this._init = init;
        this._scrubber = new SecretScrubber();

        for (const [name, value] of Object.entries(init.env)) {
            if (value && value.length >= MIN_SECRET_LENGTH && isSecretName(name)) {
                this._scrubber.add(value);
            }
        }
    }

    // #endregion

    // #region Methods

    /**
     * Returns what assistants may do right now. Without a level or a known project the server is read only.
     *
     * @public
     * @returns The level.
     */
    public activeLevel(): McpLevel {
        const level = this._init.levels.read();

        return level && this._init.assistants.knownProjectCount() > 0 ? level : 'read';
    }

    /**
     * Lists the tools the active level allows. The list is a courtesy to the client: a call is checked on its own.
     *
     * @public
     * @returns The tools.
     */
    public listTools(): Array<IMcpListedTool> {
        const level = this.activeLevel();

        return MCP_TOOLS.filter((tool) => mcpLevelAllows(level, tool.level)).map((tool) => ({
            name: tool.id,
            description: tool.description,
            inputSchema: z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>,
            annotations: { readOnlyHint: tool.level === 'read', destructiveHint: tool.level === 'write' }
        }));
    }

    /**
     * Calls a tool. Whatever goes wrong is an answer the client can read, and a call that was refused did nothing.
     *
     * @public
     * @param name The tool.
     * @param args The arguments, as untrusted as anything from a client.
     * @param clientName The name the client gave itself.
     * @returns The answer.
     */
    public async callTool(name: string, args: unknown, clientName: string | undefined): Promise<IMcpCallResult> {
        const tool = MCP_TOOLS.find((candidate) => candidate.id === name);

        if (!tool) {
            return { isError: true, text: 'This server has no such tool.' };
        }

        const client = cleanClientName(clientName);
        const level = this.activeLevel();

        if (!mcpLevelAllows(level, tool.level)) {
            return this.refuse(tool, client, `${tool.id} needs the level ${LEVEL_NAMES[tool.level]}, and this server is at ${LEVEL_NAMES[level]}, so nothing changed. The user sets the level in the Wortlaut app under MCP and plugins.`);
        }

        const input = tool.input.safeParse(args ?? {});

        if (!input.success) {
            return this.refuse(tool, client, `The input of ${tool.id} is not valid, so nothing changed: ${describeIssues(input.error)}`);
        }

        try {
            const outcome = await tool.run(input.data as never, { assistants: this._init.assistants, cwd: this._init.cwd, client });

            if (outcome.runId) {
                this._init.assistants.note(outcome.runId, { client, tool: tool.id, result: this.clean(outcome.result).slice(0, 400) });
            }

            return { isError: false, text: this.clean(JSON.stringify(this._scrubber.sanitize(outcome.data))) };
        } catch (error) {
            const message = this.clean(error instanceof Error ? error.message : String(error));

            if (error instanceof EngineError && error.runId) {
                this._init.assistants.note(error.runId, { client, tool: tool.id, result: message.slice(0, 400) });

                return { isError: true, text: message };
            }

            return this.refuse(tool, client, message);
        }
    }

    /**
     * @private
     */
    private async refuse(tool: IMcpTool, client: string, message: string): Promise<IMcpCallResult> {
        const text = this.clean(message);
        const runId = await this._init.assistants.recordRefusal(tool.id, text, this._init.cwd);

        if (runId) {
            this._init.assistants.note(runId, { client, tool: tool.id, result: text.slice(0, 400) });
        }

        return { isError: true, text };
    }

    /**
     * @private
     */
    private clean(text: string): string {
        return DisplayPath.scrub(this._scrubber.scrub(text), this._init.home);
    }

    // #endregion

}

/**
 * Says what is wrong with an input, by its fields. It repeats no value of the input.
 *
 * @private
 */
function describeIssues(error: z.ZodError): string {
    return error.issues.slice(0, 8).map((issue) => {
        const path = issue.path.join('.');

        return path ? `${path}: ${issue.message}` : issue.message;
    })
.join('; ');
}

/**
 * Makes the name a client gave itself fit to be shown. It holds no control characters and has a bound.
 *
 * @private
 */
function cleanClientName(name: string | undefined): string {
    // eslint-disable-next-line no-control-regex
    const clean = (name ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()
        .slice(0, MAX_CLIENT_NAME_LENGTH);

    return clean || 'Unknown client';
}
