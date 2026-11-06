// #region Imports

import { z } from 'zod';
import { PresetSchema } from '../../settings/ProjectOptions.js';
import { WorkspaceCodeSchema, WorkspaceColorSchema } from '../../workspaces/WorkspaceRecord.js';
import { IdSchema, WorkspaceRefSchema } from './ShellDtos.js';

// #endregion

/**
 * A workspace in the recent list, from the last known state. Reading it scans nothing.
 *
 * @public
 */
export const WorkspaceRecentSchema = WorkspaceRefSchema.extend({
  projectCount: z.number().int().nonnegative(),
  keyCount: z.number().int().nonnegative(),
  locales: z.array(z.string()),
  folderMissing: z.boolean(),
});

/**
 * @public
 */
export type WorkspaceRecent = z.output<typeof WorkspaceRecentSchema>;

/**
 * A workspace as a card of the Workspaces view, from the last known state.
 *
 * @public
 */
export const WorkspaceCardSchema = WorkspaceRecentSchema.extend({
  folder: z.string(),
  nxTarget: z.string().nullable(),
  provider: z.string().nullable(),
  failingProjects: z.number().int().nonnegative(),
});

/**
 * @public
 */
export type WorkspaceCard = z.output<typeof WorkspaceCardSchema>;

/**
 * A repository of a workspace.
 *
 * @public
 */
export const WorkspaceRepositorySchema = z.strictObject({
  displayPath: z.string(),
  missing: z.boolean(),
});

/**
 * Everything Settings: workspace shows.
 *
 * @public
 */
export const WorkspaceDetailSchema = WorkspaceRefSchema.extend({
  repositories: z.array(WorkspaceRepositorySchema),
  scanForProjects: z.boolean(),
  defaults: z.strictObject({
    baseLocale: z.string().nullable(),
    targetLocales: z.array(z.string()),
    preset: PresetSchema.nullable(),
    provider: z.string().nullable(),
  }),
  rulePackCount: z.number().int().nonnegative(),
});

/**
 * @public
 */
export type WorkspaceDetail = z.output<typeof WorkspaceDetailSchema>;

/**
 * Asks to create a workspace for a folder the user chose.
 *
 * @public
 */
export const WorkspaceCreateRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  code: WorkspaceCodeSchema,
  color: WorkspaceColorSchema,
  folderToken: z.uuid(),
});

/**
 * @public
 */
export type WorkspaceCreateRequest = z.output<typeof WorkspaceCreateRequestSchema>;

/**
 * Where a new workspace continues: projects found with their own configuration are ready, anything else goes through
 * Project setup.
 *
 * @public
 */
export const WorkspaceCreateResultSchema = z.strictObject({
  workspaceId: IdSchema,
  discovered: z.number().int().nonnegative(),
  next: z.enum(['setup', 'projects']),
});

/**
 * @public
 */
export type WorkspaceCreateResult = z.output<typeof WorkspaceCreateResultSchema>;

/**
 * Where opening a workspace continues: one project goes to Overview, anything else to Projects.
 *
 * @public
 */
export const WorkspaceOpenResultSchema = z.strictObject({
  next: z.enum(['overview', 'projects']),
});

/**
 * @public
 */
export type WorkspaceOpenResult = z.output<typeof WorkspaceOpenResultSchema>;

/**
 * What Settings: workspace changes. It lives in the user's profile, so no repository is touched. A repository is removed by
 * its position and added by the token of a native dialog.
 *
 * @public
 */
export const WorkspaceUpdateRequestSchema = z.strictObject({
  workspaceId: IdSchema,
  name: z.string().trim().min(1).max(80),
  code: WorkspaceCodeSchema,
  color: WorkspaceColorSchema,
  scanForProjects: z.boolean(),
  defaults: z.strictObject({
    baseLocale: z.string().max(40).nullable(),
    targetLocales: z.array(z.string().max(40)).max(64),
    preset: PresetSchema.nullable(),
  }),
  removeRepositories: z.array(z.number().int().nonnegative()).max(64),
  addRepositoryTokens: z.array(z.uuid()).max(16),
});

/**
 * @public
 */
export type WorkspaceUpdateRequest = z.output<typeof WorkspaceUpdateRequestSchema>;

/**
 * What became of Export workspace: the file it wrote, or `null` for a cancelled dialog.
 *
 * @public
 */
export const WorkspaceExportResultSchema = z.strictObject({
  file: z.string().nullable(),
});

/**
 * @public
 */
export type WorkspaceExportResult = z.output<typeof WorkspaceExportResultSchema>;

/**
 * What Import workspace would add, from a file that passed its check. Nothing changed yet.
 *
 * @public
 */
export const WorkspaceImportPreviewSchema = z.strictObject({
  /**
   * Names the checked file for the step that adds it.
   */
  importId: IdSchema,

  fileName: z.string(),
  name: z.string(),
  code: WorkspaceCodeSchema,
  color: WorkspaceColorSchema,
  scanForProjects: z.boolean(),
  defaults: z.strictObject({
    baseLocale: z.string().nullable(),
    targetLocales: z.array(z.string()),
    preset: PresetSchema.nullable(),
  }),

  /**
   * The repositories by name. The file names no path, so the user chooses each folder.
   */
  repositories: z.array(z.strictObject({ name: z.string() })),

  /**
   * The pinned packs. `fetch` comes from its source, `shipped` with Wortlaut and `repository` with the repository itself.
   */
  packs: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      source: z.string(),
      version: z.string().nullable(),
      kind: z.enum(['fetch', 'shipped', 'repository']),
    }),
  ),

  /**
   * A workspace of the same name already exists. Importing adds another one and changes nothing in it.
   */
  nameTaken: z.boolean(),
});

/**
 * @public
 */
export type WorkspaceImportPreview = z.output<typeof WorkspaceImportPreviewSchema>;

/**
 * What Import workspace shows after its dialog: what a file would add, or `null` for a cancelled dialog.
 *
 * @public
 */
export const WorkspaceImportChoiceSchema = z.strictObject({
  preview: WorkspaceImportPreviewSchema.nullable(),
});

/**
 * @public
 */
export type WorkspaceImportChoice = z.output<typeof WorkspaceImportChoiceSchema>;

/**
 * Adds a checked file as a new workspace, with the folders the user chose in native dialogs.
 *
 * @public
 */
export const WorkspaceImportRequestSchema = z.strictObject({
  importId: IdSchema,
  folderTokens: z.array(z.uuid()).max(64),
});

/**
 * @public
 */
export type WorkspaceImportRequest = z.output<typeof WorkspaceImportRequestSchema>;

/**
 * What Import workspace did.
 *
 * @public
 */
export const WorkspaceImportResultSchema = z.strictObject({
  workspaceId: IdSchema,
  discovered: z.number().int().nonnegative(),
  packs: z.array(
    z.strictObject({
      name: z.string(),

      /**
       * `pinned`: the repositories hold it already. `written`: its change sets were applied. `pending`: they wait in Review.
       * `skipped`: nothing can hold it yet. `refused`: its source does not give what the file names.
       */
      state: z.enum(['pinned', 'written', 'pending', 'skipped', 'refused']),
      detail: z.string().nullable(),
    }),
  ),
});

/**
 * @public
 */
export type WorkspaceImportResult = z.output<typeof WorkspaceImportResultSchema>;
