// #region Imports

import { z } from 'zod';
import { PresetSchema, ProjectOptionsSchema } from '../settings/ProjectOptions.js';

// #endregion

/**
 * A named workspace accent or an opaque RGB hex color. Legacy names remain valid in saved profiles.
 *
 * @public
 */
export const WorkspaceColorSchema = z.union([
    z.enum(['teal', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink', 'slate']),
    z.string().regex(/^#[0-9a-fA-F]{6}$/u)
        .transform((value): `#${string}` => `#${value.slice(1).toUpperCase()}`)
]);

/**
 * @public
 */
export type WorkspaceColor = z.output<typeof WorkspaceColorSchema>;

/**
 * The short code of a workspace, shown next to its name in the title bar.
 *
 * @public
 */
export const WorkspaceCodeSchema = z.string().regex(/^[\p{Lu}\p{Nd}]{1,3}$/u);

/**
 * What the last look at a project found. It is what a screen shows without scanning the project again.
 *
 * @public
 */
export const ProjectSnapshotSchema = z.strictObject({
    keyCount: z.number().int()
        .nonnegative(),
    locales: z.array(z.string()),
    scannedAt: z.iso.datetime()
});

/**
 * @public
 */
export type ProjectSnapshot = z.output<typeof ProjectSnapshotSchema>;

/**
 * How a project came to the workspace, which also says where its settings live.
 *
 * @public
 */
export const ProjectKindSchema = z.enum(['nx-target', 'configuration', 'setup']);

/**
 * @public
 */
export type ProjectKind = z.output<typeof ProjectKindSchema>;

/**
 * A project registered in the user's profile. The folder is absolute and stays in the main process.
 *
 * @public
 */
export const ProjectRecordSchema = z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    name: z.string().min(1),
    folder: z.string().min(1),
    kind: ProjectKindSchema,

    /**
     * The name of the Nx target that runs Wortlaut for this project.
     */
    nxTarget: z.string().nullable(),

    /**
     * What was chosen at setup for a project without a configuration of its own, in the shape of command arguments
     * relative to the folder. A configuration in the repository always wins over it.
     */
    setup: ProjectOptionsSchema.nullable(),

    snapshot: ProjectSnapshotSchema.nullable(),
    addedAt: z.iso.datetime()
});

/**
 * @public
 */
export type ProjectRecord = z.output<typeof ProjectRecordSchema>;

/**
 * The values a new project of a workspace starts from. They never join the configuration resolution, so a run from the
 * CLI reads the same values as the app.
 *
 * @public
 */
export const WorkspaceDefaultsSchema = z.strictObject({
    baseLocale: z.string().nullable(),
    targetLocales: z.array(z.string()),
    preset: PresetSchema.nullable()
});

/**
 * @public
 */
export type WorkspaceDefaults = z.output<typeof WorkspaceDefaultsSchema>;

/**
 * A workspace in the user's profile.
 *
 * @public
 */
export const WorkspaceRecordSchema = z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9-]+$/),
    name: z.string().min(1)
        .max(80),
    code: WorkspaceCodeSchema,
    color: WorkspaceColorSchema,
    repositories: z.array(z.string().min(1)),
    scanForProjects: z.boolean(),
    defaults: WorkspaceDefaultsSchema,
    projects: z.array(ProjectRecordSchema),
    createdAt: z.iso.datetime(),
    openedAt: z.iso.datetime().nullable()
});

/**
 * @public
 */
export type WorkspaceRecord = z.output<typeof WorkspaceRecordSchema>;

/**
 * The file that holds the workspaces of the user's profile.
 *
 * @public
 */
export const WorkspaceFileSchema = z.strictObject({
    schemaVersion: z.literal(1),
    workspaces: z.array(WorkspaceRecordSchema)
});

/**
 * @public
 */
export type WorkspaceFile = z.output<typeof WorkspaceFileSchema>;
