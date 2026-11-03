// #region Imports

import { z } from 'zod';
import { LocaleTagSchema, PresetSchema, ResourceFormatSchema } from '../../settings/ProjectOptions.js';
import { WorkspaceCodeSchema, WorkspaceColorSchema } from '../../workspaces/WorkspaceRecord.js';
import { IdSchema, WorkspaceRefSchema } from './ShellDtos.js';

// #endregion

/**
 * A folder with catalogs that an inspection found.
 *
 * @public
 */
export const CatalogFolderSchema = z.strictObject({
    folder: z.string(),
    files: z.array(z.string()),
    keys: z.number().int()
        .nonnegative(),
    format: ResourceFormatSchema
});

/**
 * @public
 */
export type CatalogFolder = z.output<typeof CatalogFolderSchema>;

/**
 * A locale that an inspection found in the catalogs.
 *
 * @public
 */
export const DiscoveredLocaleSchema = z.strictObject({
    code: z.string(),
    keys: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type DiscoveredLocale = z.output<typeof DiscoveredLocaleSchema>;

/**
 * What Wortlaut found in a folder, with the evidence for each value. Nothing is written while inspecting.
 *
 * @public
 */
export const ProjectInspectionSchema = z.strictObject({
    name: z.string(),
    displayPath: z.string(),

    /**
     * The configuration a repository already has. Such a project needs no setup values of its own.
     */
    configuration: z.strictObject({
        kind: z.enum(['nx-target', 'wortlaut-config', 'localizator-config']),
        file: z.string()
    }).nullable(),

    preset: z.strictObject({
        value: PresetSchema.nullable(),
        evidence: z.string()
    }),
    sourceRoot: z.strictObject({
        value: z.string(),
        fileCount: z.number().int()
            .nonnegative(),
        evidence: z.string()
    }),
    prefix: z.strictObject({
        value: z.string(),
        evidence: z.string()
    }),
    catalogs: z.array(CatalogFolderSchema),
    locales: z.array(DiscoveredLocaleSchema),
    baseLocale: z.string(),

    /**
     * Locales to offer that do not exist yet.
     */
    suggestedLocales: z.array(z.string()),

    /**
     * The scan stopped at its bound, so a big repository may hold more.
     */
    truncated: z.boolean()
});

/**
 * @public
 */
export type ProjectInspection = z.output<typeof ProjectInspectionSchema>;

/**
 * Asks to inspect a folder the user chose, with further catalog folders below it.
 *
 * @public
 */
export const ProjectInspectRequestSchema = z.strictObject({
    folderToken: z.uuid(),
    catalogFolderTokens: z.array(z.uuid()).max(32),

    /**
     * The preset the user picked, or `null` to infer it. The source root follows it.
     */
    preset: PresetSchema.nullable()
});

/**
 * Registers a project in the user's profile, and proposes the configuration file of a project that has none. The renderer
 * names folders by their tokens, and main inspects them again for every value that holds a path.
 *
 * @public
 */
export const ProjectRegisterRequestSchema = z.strictObject({
    folderToken: z.uuid(),
    catalogFolderTokens: z.array(z.uuid()).max(32),
    workspace: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('existing'), id: IdSchema }),
        z.strictObject({
            kind: z.literal('new'),
            name: z.string().trim()
                .min(1)
                .max(80),
            code: WorkspaceCodeSchema,
            color: WorkspaceColorSchema
        })
    ]),
    preset: PresetSchema.nullable(),
    baseLocale: LocaleTagSchema,
    targetLocales: z.array(LocaleTagSchema).max(64)
});

/**
 * @public
 */
export type ProjectRegisterRequest = z.output<typeof ProjectRegisterRequestSchema>;

/**
 * The project that was registered.
 *
 * @public
 */
export const ProjectRegisterResultSchema = z.strictObject({
    workspaceId: IdSchema,
    projectId: IdSchema,

    /**
     * What became of `wortlaut.config.json`, or `null` for a project that brings its configuration.
     */
    configFile: z.enum(['written', 'pending']).nullable()
});

/**
 * @public
 */
export type ProjectRegisterResult = z.output<typeof ProjectRegisterResultSchema>;

/**
 * The state badge of a project: the result of the last analysis, never a new scan.
 *
 * @public
 */
export const ProjectStateSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not-analyzed') }),
    z.strictObject({ kind: z.literal('clean') }),
    z.strictObject({ kind: z.literal('failing'), rules: z.number().int()
        .positive() }),
    z.strictObject({ kind: z.literal('folder-missing') })
]);

/**
 * @public
 */
export type ProjectState = z.output<typeof ProjectStateSchema>;

/**
 * One row of the table of projects.
 *
 * @public
 */
export const ProjectRowSchema = z.strictObject({
    id: IdSchema,
    name: z.string(),
    folder: z.string(),

    /**
     * `null` while the project could not be read.
     */
    keys: z.number().int()
        .nonnegative()
        .nullable(),

    locales: z.array(z.string()),
    state: ProjectStateSchema
});

/**
 * @public
 */
export type ProjectRow = z.output<typeof ProjectRowSchema>;

/**
 * A value of `targetDefaults` in `nx.json`, which Wortlaut reads and keeps as the user's source.
 *
 * @public
 */
export const SharedDefaultSchema = z.strictObject({
    label: z.string(),
    value: z.string()
});

/**
 * @public
 */
export type SharedDefault = z.output<typeof SharedDefaultSchema>;

/**
 * The commands that the app can run on all projects.
 *
 * @public
 */
export const RunAllCommandSchema = z.enum(['detect', 'analyze', 'transform', 'sort', 'generate']);

/**
 * @public
 */
export type RunAllCommand = z.output<typeof RunAllCommandSchema>;

/**
 * Everything the Projects view shows.
 *
 * @public
 */
export const ProjectListSchema = z.strictObject({
    workspace: WorkspaceRefSchema,
    folder: z.string(),
    nxTarget: z.string().nullable(),
    totalKeys: z.number().int()
        .nonnegative(),
    rows: z.array(ProjectRowSchema),

    /**
     * The commands that do the same from a terminal, or `null` for a workspace without Nx.
     */
    sameAs: z.record(RunAllCommandSchema, z.string()).nullable(),

    /**
     * `null` for a workspace without shared Nx defaults.
     */
    sharedDefaults: z.array(SharedDefaultSchema).nullable()
});

/**
 * @public
 */
export type ProjectList = z.output<typeof ProjectListSchema>;

/**
 * A next step of a project, generated from its real state. Views turn it into copy.
 *
 * @public
 */
export const NextStepSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('identical-values'), count: z.number().int()
        .positive() }),
    z.strictObject({ kind: z.literal('unused-keys'), count: z.number().int()
        .positive() }),
    z.strictObject({
        kind: z.literal('missing-locale'),
        locale: z.string(),
        keys: z.number().int()
            .nonnegative(),
        chunks: z.number().int()
            .nonnegative()
    })
]);

/**
 * @public
 */
export type NextStep = z.output<typeof NextStepSchema>;

/**
 * The coverage of one locale.
 *
 * @public
 */
export const LocaleCoverageSchema = z.strictObject({
    code: z.string(),
    isBase: z.boolean(),

    /**
     * The catalog file, or `null` when the locale has none yet.
     */
    file: z.string().nullable(),

    /**
     * The number of keys of the base locale.
     */
    total: z.number().int()
        .nonnegative(),

    /**
     * The values that differ from the base locale, after the declared exceptions.
     */
    translated: z.number().int()
        .nonnegative(),

    identical: z.number().int()
        .nonnegative(),
    missing: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type LocaleCoverage = z.output<typeof LocaleCoverageSchema>;

/**
 * The key count of a namespace.
 *
 * @public
 */
export const NamespaceCountSchema = z.strictObject({
    name: z.string(),
    count: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type NamespaceCount = z.output<typeof NamespaceCountSchema>;

/**
 * The last result of an analyzer rule.
 *
 * @public
 */
export const RuleResultSchema = z.strictObject({
    id: z.string(),
    passed: z.boolean(),

    /**
     * What a failing rule found per locale.
     */
    locales: z.array(z.strictObject({
        locale: z.string().nullable(),
        count: z.number().int()
            .nonnegative()
            .nullable()
    }))
});

/**
 * @public
 */
export type RuleResult = z.output<typeof RuleResultSchema>;

/**
 * Everything Overview shows about a project.
 *
 * @public
 */
export const ProjectSummarySchema = z.strictObject({
    name: z.string(),
    resourceRoot: z.string().nullable(),
    format: ResourceFormatSchema,
    preset: PresetSchema.nullable(),
    hasCatalogs: z.boolean(),
    sourceRoot: z.string().nullable(),
    baseLocale: z.string(),
    keyCount: z.number().int()
        .nonnegative(),
    catalogCount: z.number().int()
        .nonnegative(),
    namespaceCount: z.number().int()
        .nonnegative(),

    /**
     * The share of translated values from 0 to 1, or `null` without a target locale.
     */
    translatedShare: z.number().min(0)
        .max(1)
        .nullable(),

    translatedCount: z.number().int()
        .nonnegative(),
    translatableCount: z.number().int()
        .nonnegative(),

    /**
     * The results of the last analysis of this project, or `null` before the first one.
     */
    analysis: z.strictObject({
        runId: IdSchema,
        finishedAt: z.iso.datetime(),
        rules: z.array(RuleResultSchema),
        failingRules: z.number().int()
            .nonnegative(),
        unusedKeys: z.number().int()
            .nonnegative()
            .nullable()
    }).nullable(),

    nextSteps: z.array(NextStepSchema).max(3),
    locales: z.array(LocaleCoverageSchema),
    namespaces: z.array(NamespaceCountSchema),

    /**
     * What the namespaces beyond the listed ones hold together.
     */
    moreNamespaces: NamespaceCountSchema.nullable()
});

/**
 * @public
 */
export type ProjectSummary = z.output<typeof ProjectSummarySchema>;

/**
 * Where a value of Settings: project comes from.
 *
 * @public
 */
export const ProjectFieldSourceSchema = z.strictObject({
    kind: z.string(),
    file: z.string().nullable()
});

/**
 * An analyzer rule and whether the project runs it.
 *
 * @public
 */
export const ProjectRuleSettingSchema = z.strictObject({
    id: z.string(),
    enabled: z.boolean()
});

/**
 * Everything Settings: project shows.
 *
 * @public
 */
export const ProjectSettingsSchema = z.strictObject({
    name: z.string(),
    workingDirectory: z.string(),
    sourceRoot: z.string(),
    resourceRoots: z.array(z.string()),
    preset: PresetSchema.nullable(),
    format: ResourceFormatSchema,
    prefix: z.string(),
    suffix: z.string(),
    baseLocale: z.string(),
    targetLocales: z.array(z.string()),
    rules: z.array(ProjectRuleSettingSchema),
    usedKeys: z.array(z.string()),
    identicalKeys: z.array(z.string()),
    identicalValues: z.array(z.string())
});

/**
 * @public
 */
export type ProjectSettings = z.output<typeof ProjectSettingsSchema>;

/**
 * What Settings: project changes. A folder is named by its token, an existing resource root by its position, and a value
 * that is left out stays as it is.
 *
 * @public
 */
export const ProjectSettingsChangesSchema = z.strictObject({
    preset: PresetSchema.nullable().optional(),
    format: ResourceFormatSchema.optional(),
    prefix: z.string().max(200)
        .optional(),
    suffix: z.string().max(200)
        .optional(),
    baseLocale: LocaleTagSchema.optional(),
    targetLocales: z.array(LocaleTagSchema).max(64)
        .optional(),
    rules: z.array(z.string().max(120)).max(128)
        .optional(),
    usedKeys: z.array(z.string().max(2000)).max(4096)
        .optional(),
    identicalKeys: z.array(z.string().max(2000)).max(4096)
        .optional(),
    identicalValues: z.array(z.string().max(2000)).max(4096)
        .optional(),
    sourceRootToken: z.uuid().optional(),
    addResourceRootTokens: z.array(z.uuid()).max(32)
        .optional(),
    removeResourceRoots: z.array(z.number().int()
        .nonnegative()).max(32)
        .optional()
});

/**
 * @public
 */
export type ProjectSettingsChanges = z.output<typeof ProjectSettingsChangesSchema>;
