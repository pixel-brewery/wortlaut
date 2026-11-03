// #region Imports

import { IdSchema, LocaleTagSchema, ResourceTargetSchema, type McpLevel, type McpTool } from '@pixel-brewery/wortlaut-contracts';
import type { AssistantCommands, IAssistantOutcome } from '@pixel-brewery/wortlaut-engine';
import { z } from 'zod';

// #endregion

/**
 * The most rows one proposal takes.
 */
const MAX_ROWS = 500;

/**
 * The longest translation one row takes.
 */
const MAX_VALUE_LENGTH = 20_000;

/**
 * The longest name of a key. It has the bound of a key of a catalog.
 */
const MAX_KEY_LENGTH = 1000;

/**
 * The longest pattern. A longer one is no pattern for keys anymore.
 */
const MAX_PATTERN_LENGTH = 300;

/**
 * A project by its id from `list_projects`. Without it the server takes the project it was started in. No tool takes a path.
 */
const ProjectSchema = IdSchema.optional().describe('The id of a project from list_projects. Without it, the project the server was started in.');

/**
 * Whether a tool that writes only says what it would do.
 */
const DryRunSchema = z.boolean().default(false)
    .describe('Only report what would be written. Nothing is stored and nothing is written.');

/**
 * What a tool gets for one call.
 *
 * @public
 */
export interface IMcpToolContext {
    assistants: AssistantCommands;

    /**
     * The folder the server was started in.
     */
    cwd: string;

    /**
     * The name the client gave itself. It labels what the tool leaves behind and decides nothing.
     */
    client: string;
}

/**
 * One tool of the server. It says what it needs and hands over to the engine, and holds no logic of its own.
 *
 * @public
 */
export interface IMcpTool {
    id: string;
    description: string;

    /**
     * The level it needs.
     */
    level: McpLevel;
    input: z.ZodType;
    run(input: never, context: IMcpToolContext): Promise<IAssistantOutcome>;
}

/**
 * @private
 */
function defineTool<TSchema extends z.ZodType>(tool: { id: string; description: string; level: McpLevel; input: TSchema; run(input: z.output<TSchema>, context: IMcpToolContext): Promise<IAssistantOutcome> }): IMcpTool {
    return tool as unknown as IMcpTool;
}

/**
 * The twelve tools. Every input is a strict schema, so an argument that the tool does not know, such as a path or a level, is
 * refused instead of being ignored.
 *
 * @public
 */
export const MCP_TOOLS: ReadonlyArray<IMcpTool> = [
    defineTool({
        id: 'list_projects',
        description: 'Lists the workspaces and projects.',
        level: 'read',
        input: z.strictObject({}),
        run: (_input, { assistants, cwd }) => assistants.listProjects(cwd)
    }),
    defineTool({
        id: 'get_config',
        description: 'Shows the effective settings and where they come from.',
        level: 'read',
        input: z.strictObject({ project: ProjectSchema }),
        run: (input, { assistants, cwd }) => assistants.getConfig(input.project ?? null, cwd)
    }),
    defineTool({
        id: 'search_keys',
        description: 'Finds keys and values across locales.',
        level: 'read',
        input: z.strictObject({
            project: ProjectSchema,
            query: z.string().max(MAX_PATTERN_LENGTH)
                .default('')
                .describe('Text in a key or a value.'),
            namespace: z.string().max(MAX_PATTERN_LENGTH)
                .optional(),
            locale: LocaleTagSchema.optional().describe('The locale whose value each row shows.'),
            limit: z.number().int()
                .min(1)
                .max(200)
                .default(50)
        }),
        run: (input, { assistants, cwd }) => assistants.searchKeys({ projectId: input.project ?? null, query: input.query, namespace: input.namespace ?? null, locale: input.locale ?? null, limit: input.limit }, cwd)
    }),
    defineTool({
        id: 'detect',
        description: 'Finds hard-coded strings, without writing.',
        level: 'read',
        input: z.strictObject({ project: ProjectSchema }),
        run: (input, { assistants, cwd }) => assistants.detect(input.project ?? null, cwd)
    }),
    defineTool({
        id: 'analyze',
        description: 'Runs the rules and returns the findings.',
        level: 'read',
        input: z.strictObject({
            project: ProjectSchema,
            rules: z.array(z.string().max(120)).min(1)
                .max(128)
                .optional()
                .describe('Only these rules. Without it, the rules of the project.')
        }),
        run: (input, { assistants, cwd }) => assistants.analyze(input.project ?? null, input.rules ?? null, cwd)
    }),
    defineTool({
        id: 'test_pattern',
        description: 'Shows which keys a pattern covers.',
        level: 'read',
        input: z.strictObject({
            project: ProjectSchema,
            pattern: z.string().min(1)
                .max(MAX_PATTERN_LENGTH),
            list: z.enum(['usedKeys', 'identicalKeys']).default('usedKeys')
                .describe('The list the pattern would go into: used keys read globs and regular expressions, identical keys only *.')
        }),
        run: (input, { assistants, cwd }) => assistants.testPattern({ projectId: input.project ?? null, pattern: input.pattern, list: input.list }, cwd)
    }),
    defineTool({
        id: 'next_translations',
        description: 'Hands the assistant the next keys to translate, with context.',
        level: 'read',
        input: z.strictObject({
            project: ProjectSchema,
            locale: LocaleTagSchema.describe('The target locale.'),
            namespace: z.string().max(MAX_PATTERN_LENGTH)
                .optional(),
            limit: z.number().int()
                .min(1)
                .max(100)
                .default(10)
        }),
        run: (input, { assistants, cwd }) => assistants.nextTranslations({ projectId: input.project ?? null, locale: input.locale, namespace: input.namespace ?? null, limit: input.limit }, cwd)
    }),
    defineTool({
        id: 'propose_translations',
        description: 'Takes translations from the assistant, checks them and adds them to the review list.',
        level: 'propose',
        input: z.strictObject({
            project: ProjectSchema,
            locale: LocaleTagSchema.describe('The target locale.'),
            rows: z.array(z.strictObject({
                key: z.string().min(1)
                    .max(MAX_KEY_LENGTH),
                value: z.string().max(MAX_VALUE_LENGTH)
            })).min(1)
                .max(MAX_ROWS)
        }),
        run: (input, { assistants, cwd, client }) => assistants.proposeTranslations({ projectId: input.project ?? null, locale: input.locale, rows: input.rows, client }, cwd)
    }),
    defineTool({
        id: 'propose_keys',
        description: 'Suggests keys for hard-coded strings.',
        level: 'propose',
        input: z.strictObject({
            project: ProjectSchema,
            scanId: IdSchema.describe('The scanId of a detect call of this session.'),
            rows: z.array(z.strictObject({
                rowId: IdSchema,
                key: z.string().regex(/^[\p{L}\p{N}_.-]+$/u)
                    .max(300)
            })).min(1)
                .max(MAX_ROWS)
        }),
        run: (input, { assistants, cwd }) => assistants.proposeKeys({ projectId: input.project ?? null, scanId: input.scanId, rows: input.rows }, cwd)
    }),
    defineTool({
        id: 'apply_changes',
        description: 'Writes approved changes to the catalogs.',
        level: 'write',
        input: z.strictObject({
            id: IdSchema.describe('The changeSetId a proposal returned.'),
            dryRun: DryRunSchema
        }),
        run: (input, { assistants, cwd }) => assistants.applyChanges({ id: input.id, dryRun: input.dryRun }, cwd)
    }),
    defineTool({
        id: 'transform',
        description: 'Generates TypeScript, RESX or PO files.',
        level: 'write',
        input: z.strictObject({
            project: ProjectSchema,
            types: z.array(ResourceTargetSchema).min(1)
                .max(4)
                .optional()
                .describe('The formats. Without it, the formats of the project.'),
            dryRun: DryRunSchema
        }),
        run: (input, { assistants, cwd }) => assistants.transform({ projectId: input.project ?? null, types: input.types ?? null, dryRun: input.dryRun }, cwd)
    }),
    defineTool({
        id: 'sort',
        description: 'Sorts the keys in catalogs.',
        level: 'write',
        input: z.strictObject({
            project: ProjectSchema,
            order: z.enum(['asc', 'desc']).optional()
                .describe('Without it, the order of the project.'),
            dryRun: DryRunSchema
        }),
        run: (input, { assistants, cwd }) => assistants.sort({ projectId: input.project ?? null, order: input.order ?? null, dryRun: input.dryRun }, cwd)
    })
];

/**
 * Returns the tools as the MCP screen lists them.
 *
 * @public
 * @returns The tools with the level each one needs.
 */
export function mcpToolCatalog(): Array<McpTool> {
    return MCP_TOOLS.map(({ id, description, level }) => ({ id, description, level }));
}
