// #region Imports

import { z } from 'zod';
import { RuleSeveritySchema } from '../../rulepacks/RulePack.js';
import { RunCommandNameSchema } from '../../common/CommandName.js';
import { PresetSchema, ResourceFormatSchema, ResourceTargetSchema } from '../../settings/ProjectOptions.js';
import { RunStateSchema } from '../../runs/RunRecord.js';
import { GenerateInputSchema } from './AiDtos.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * What a control that writes did. With dry run on, nothing reaches the repository and the change set waits in Review.
 *
 * @public
 */
export const WriteOutcomeSchema = z.strictObject({
    state: z.enum(['applied', 'pending', 'unchanged']),
    changeSetId: IdSchema.nullable(),
    runId: IdSchema.nullable(),

    /**
     * The files, as display paths.
     */
    files: z.array(z.string())
});

/**
 * @public
 */
export type WriteOutcome = z.output<typeof WriteOutcomeSchema>;

/**
 * The settings of a scan that apply to this scan only.
 *
 * @public
 */
export const DetectScanInputSchema = z.strictObject({
    preset: PresetSchema.nullable(),
    suffix: z.string().max(80),
    skipTests: z.boolean()
});

/**
 * @public
 */
export type DetectScanInput = z.output<typeof DetectScanInputSchema>;

/**
 * The rules of one analysis, on top of the configuration.
 *
 * @public
 */
export const AnalyzeInputSchema = z.strictObject({
    rules: z.array(z.string().max(120)).max(128)
});

/**
 * @public
 */
export type AnalyzeInput = z.output<typeof AnalyzeInputSchema>;

/**
 * The target formats of one transformation.
 *
 * @public
 */
export const TransformInputSchema = z.strictObject({
    types: z.array(ResourceTargetSchema).min(1)
        .max(4)
});

/**
 * @public
 */
export type TransformInput = z.output<typeof TransformInputSchema>;

/**
 * The order of one sort.
 *
 * @public
 */
export const SortInputSchema = z.strictObject({
    order: z.enum(['asc', 'desc'])
});

/**
 * @public
 */
export type SortInput = z.output<typeof SortInputSchema>;

/**
 * Asks to start a command of a project. It runs in main, so a reload of the renderer does not end it.
 *
 * @public
 */
export const RunStartRequestSchema = z.discriminatedUnion('command', [
    z.strictObject({ command: z.literal('detect'), projectId: IdSchema, input: DetectScanInputSchema }),
    z.strictObject({ command: z.literal('analyze'), projectId: IdSchema, input: AnalyzeInputSchema }),
    z.strictObject({ command: z.literal('transform'), projectId: IdSchema, input: TransformInputSchema }),
    z.strictObject({ command: z.literal('sort'), projectId: IdSchema, input: SortInputSchema }),
    z.strictObject({ command: z.literal('generate'), projectId: IdSchema, input: GenerateInputSchema })
]);

/**
 * @public
 */
export type RunStartRequest = z.output<typeof RunStartRequestSchema>;

/**
 * Asks to run a command on all projects of a workspace.
 *
 * @public
 */
export const RunAllRequestSchema = z.strictObject({
    workspaceId: IdSchema,
    command: z.enum(['detect', 'analyze', 'transform', 'sort', 'generate'])
});

/**
 * One project of "Run on all projects": how far it is, and in the end what became of it.
 *
 * @public
 */
export const RunBatchRowSchema = z.strictObject({
    projectId: IdSchema,
    projectName: z.string(),
    runId: IdSchema,
    state: z.enum(['waiting', 'running', 'succeeded', 'failed', 'stopped']),

    /**
     * What the run found or changed, in one line, once it has ended.
     */
    summary: z.string().nullable(),
    failure: z.string().nullable()
});

/**
 * @public
 */
export type RunBatchRow = z.output<typeof RunBatchRowSchema>;

/**
 * The last "Run on all projects" of a workspace. It lives in main, so a reload of the renderer finds it again.
 *
 * @public
 */
export const RunBatchSchema = z.strictObject({
    id: IdSchema,
    workspaceId: IdSchema,
    command: z.enum(['detect', 'analyze', 'transform', 'sort', 'generate']),
    dryRun: z.boolean(),
    startedAt: z.iso.datetime(),

    /**
     * How many projects work at the same time.
     */
    concurrency: z.number().int()
        .positive(),
    rows: z.array(RunBatchRowSchema)
});

/**
 * @public
 */
export type RunBatch = z.output<typeof RunBatchSchema>;

/**
 * A run that is going on right now.
 *
 * @public
 */
export const ActiveRunSchema = z.strictObject({
    id: IdSchema,
    command: RunCommandNameSchema,
    projectId: IdSchema,
    projectName: z.string(),
    title: z.string(),
    startedAt: z.iso.datetime(),
    dryRun: z.boolean(),
    phase: z.string(),
    completed: z.number().int()
        .nonnegative(),
    total: z.number().int()
        .nonnegative(),
    detail: z.string().nullable(),

    /**
     * The batch of "Run on all projects" this run belongs to.
     */
    batch: z.strictObject({
        id: IdSchema,
        index: z.number().int()
            .nonnegative(),
        total: z.number().int()
            .positive()
    }).nullable(),

    /**
     * The last lines of its log.
     */
    log: z.array(z.string())
});

/**
 * @public
 */
export type ActiveRun = z.output<typeof ActiveRunSchema>;

/**
 * How a detected string relates to the catalog and to the scan.
 *
 * @public
 */
export const DetectHintSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('reuse'), key: z.string() }),
    z.strictObject({ kind: z.literal('new') }),
    z.strictObject({ kind: z.literal('test') }),
    z.strictObject({ kind: z.literal('placeholder') })
]);

/**
 * @public
 */
export type DetectHint = z.output<typeof DetectHintSchema>;

/**
 * A hard-coded string of a scan.
 *
 * @public
 */
export const DetectRowSchema = z.strictObject({
    id: IdSchema,
    value: z.string(),

    /**
     * The file, relative to the project.
     */
    file: z.string(),

    /**
     * The file name and line, for the table.
     */
    location: z.string(),
    line: z.number().int()
        .positive(),
    column: z.number().int()
        .nonnegative(),
    key: z.string(),
    hint: DetectHintSchema,

    /**
     * Whether it can be applied at all: a test file or a value with a placeholder stays as it is.
     */
    canApply: z.boolean(),

    /**
     * The line of the source today, and what it becomes.
     */
    before: z.string(),
    after: z.string(),

    /**
     * What stands around the value in its line, so a view can show the line with another key.
     */
    around: z.strictObject({ head: z.string(), tail: z.string() }).nullable()
});

/**
 * @public
 */
export type DetectRow = z.output<typeof DetectRowSchema>;

/**
 * The result of a scan.
 *
 * @public
 */
export const DetectScanResultSchema = z.strictObject({
    scanId: IdSchema,
    filesScanned: z.number().int()
        .nonnegative(),
    stringsFound: z.number().int()
        .nonnegative(),
    alreadyKeys: z.number().int()
        .nonnegative(),
    hardCoded: z.number().int()
        .nonnegative(),

    /**
     * The first hard-coded strings. A very big project holds more, which the next scan finds.
     */
    rows: z.array(DetectRowSchema),

    /**
     * The walk stopped at its bound, so a very big repository may hold more.
     */
    truncated: z.boolean()
});

/**
 * @public
 */
export type DetectScanResult = z.output<typeof DetectScanResultSchema>;

/**
 * Asks to apply rows of a scan to the source and the catalog, as one change set.
 *
 * @public
 */
export const DetectApplyRequestSchema = z.strictObject({
    projectId: IdSchema,
    scanId: IdSchema,
    rows: z.array(z.strictObject({
        rowId: IdSchema,
        key: z.string().regex(/^[\p{L}\p{N}_.-]+$/u)
            .max(300)
    })).min(1)
        .max(20000)
});

/**
 * @public
 */
export type DetectApplyRequest = z.output<typeof DetectApplyRequestSchema>;

/**
 * A preset with the file types it reads.
 *
 * @public
 */
export const PresetInfoSchema = z.strictObject({
    id: PresetSchema,
    name: z.string(),
    extensions: z.array(z.string())
});

/**
 * @public
 */
export type PresetInfo = z.output<typeof PresetInfoSchema>;

/**
 * What the settings of a scan start from.
 *
 * @public
 */
export const DetectSettingsSchema = z.strictObject({
    presets: z.array(PresetInfoSchema),
    preset: PresetSchema.nullable(),
    sourceRoot: z.string(),
    prefix: z.string(),
    suffix: z.string(),
    format: ResourceFormatSchema
});

/**
 * @public
 */
export type DetectSettings = z.output<typeof DetectSettingsSchema>;

/**
 * The three lists of exceptions a project configures.
 *
 * @public
 */
export const ExceptionListNameSchema = z.enum(['usedKeys', 'identicalKeys', 'identicalValues']);

/**
 * @public
 */
export type ExceptionListName = z.output<typeof ExceptionListNameSchema>;

/**
 * The exceptions of a project.
 *
 * @public
 */
export const ExceptionsSchema = z.strictObject({
    usedKeys: z.array(z.string()),
    identicalKeys: z.array(z.string()),
    identicalValues: z.array(z.string())
});

/**
 * @public
 */
export type Exceptions = z.output<typeof ExceptionsSchema>;

/**
 * What a rule found in a locale.
 *
 * @public
 */
export const RuleLocaleCountSchema = z.strictObject({
    locale: z.string().nullable(),
    count: z.number().int()
        .nonnegative()
        .nullable()
});

/**
 * A rule as the list of Analyze shows it. Its switch affects one run, and the configuration decides how it starts.
 *
 * @public
 */
export const AnalyzeRuleSchema = z.strictObject({
    id: z.string(),
    group: z.string(),
    description: z.string(),
    enabled: z.boolean(),

    /**
     * What the rule is worth in this project, which colors its result.
     */
    severity: RuleSeveritySchema,

    /**
     * The result of the last analysis, or `null` when it did not run this rule.
     */
    last: z.strictObject({
        passed: z.boolean(),
        locales: z.array(RuleLocaleCountSchema)
    }).nullable()
});

/**
 * @public
 */
export type AnalyzeRule = z.output<typeof AnalyzeRuleSchema>;

/**
 * Everything Analyze shows before a run.
 *
 * @public
 */
export const AnalyzeOverviewSchema = z.strictObject({
    baseLocale: z.string(),
    locales: z.array(z.string()),
    sourceRoot: z.string().nullable(),
    rules: z.array(AnalyzeRuleSchema),
    exceptions: ExceptionsSchema,

    /**
     * The packs of the lock file that failed their verification. Their rules do not run.
     */
    refusedPacks: z.array(z.strictObject({ name: z.string(), reason: z.string() }))
});

/**
 * @public
 */
export type AnalyzeOverview = z.output<typeof AnalyzeOverviewSchema>;

/**
 * A row of the result of a rule. What it means follows from the rule.
 *
 * @public
 */
export const AnalyzeRowSchema = z.strictObject({

    /**
     * The first column: a key, a value or a locale.
     */
    a: z.string(),

    /**
     * The second column.
     */
    b: z.string(),
    key: z.string().nullable(),
    value: z.string().nullable(),
    keys: z.array(z.string()),
    locale: z.string().nullable()
});

/**
 * @public
 */
export type AnalyzeRow = z.output<typeof AnalyzeRowSchema>;

/**
 * The result of a rule in one analysis.
 *
 * @public
 */
export const AnalyzeRuleResultSchema = z.strictObject({
    id: z.string(),
    passed: z.boolean(),
    message: z.string(),
    locales: z.array(RuleLocaleCountSchema),

    /**
     * How many rows there are in all, of which `rows` holds the first ones.
     */
    total: z.number().int()
        .nonnegative(),
    rows: z.array(AnalyzeRowSchema),

    /**
     * What the rule is worth in this run.
     */
    severity: RuleSeveritySchema,

    /**
     * What a rule of a pack says about itself. A built-in rule has this in the view.
     */
    pack: z.strictObject({
        name: z.string(),
        title: z.string(),
        column: z.string()
    }).nullable()
});

/**
 * @public
 */
export type AnalyzeRuleResult = z.output<typeof AnalyzeRuleResultSchema>;

/**
 * A format a project can convert into.
 *
 * @public
 */
export const TransformFormatSchema = z.strictObject({
    id: ResourceTargetSchema,
    name: z.string(),
    description: z.string(),
    enabled: z.boolean()
});

/**
 * @public
 */
export type TransformFormat = z.output<typeof TransformFormatSchema>;

/**
 * Everything Transform and sort shows before a run.
 *
 * @public
 */
export const TransformOverviewSchema = z.strictObject({

    /**
     * The name of the source catalogs, such as `lang.*.json`.
     */
    source: z.string(),
    formats: z.array(TransformFormatSchema),
    order: z.enum(['asc', 'desc']),
    keyCount: z.number().int()
        .nonnegative(),
    fileCount: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type TransformOverview = z.output<typeof TransformOverviewSchema>;

/**
 * A file of the result of a transformation or a sort.
 *
 * @public
 */
export const OutputRowSchema = z.strictObject({
    file: z.string(),
    keys: z.number().int()
        .nonnegative(),
    state: z.enum(['written', 'would-be-written', 'waiting', 'unchanged']),
    preview: z.string(),
    previewTruncated: z.boolean()
});

/**
 * @public
 */
export type OutputRow = z.output<typeof OutputRowSchema>;

/**
 * What a finished run hands to the view that started it.
 *
 * @public
 */
export const RunOutputSchema = z.discriminatedUnion('command', [
    z.strictObject({ command: z.literal('detect'), scan: DetectScanResultSchema }),
    z.strictObject({ command: z.literal('analyze'), rules: z.array(AnalyzeRuleResultSchema) }),
    z.strictObject({ command: z.literal('transform'), rows: z.array(OutputRowSchema) }),
    z.strictObject({ command: z.literal('sort'), rows: z.array(OutputRowSchema) }),
    z.strictObject({ command: z.literal('generate'), translated: z.number().int()
        .nonnegative() })
]);

/**
 * @public
 */
export type RunOutput = z.output<typeof RunOutputSchema>;

/**
 * How a run started from the app ended, with its output when it has one.
 *
 * @public
 */
export const RunResultSchema = z.strictObject({
    runId: IdSchema,
    command: RunCommandNameSchema,
    projectId: IdSchema,
    state: RunStateSchema,
    dryRun: z.boolean(),
    failure: z.string().nullable(),
    outcome: WriteOutcomeSchema.nullable(),
    output: RunOutputSchema.nullable()
});

/**
 * @public
 */
export type RunResult = z.output<typeof RunResultSchema>;
