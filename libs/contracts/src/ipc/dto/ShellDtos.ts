// #region Imports

import { z } from 'zod';
import { WorkspaceCodeSchema, WorkspaceColorSchema } from '../../workspaces/WorkspaceRecord.js';

// #endregion

/**
 * The opaque id of a stored thing. It is never a path.
 *
 * @public
 */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]+$/)
  .max(128);

/**
 * What the sidebar and the bug report show about the app.
 *
 * @public
 */
export const AppInfoSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  cpus: z.number().int().nonnegative(),
  totalMemory: z.number().nonnegative(),
});

/**
 * @public
 */
export type AppInfo = z.output<typeof AppInfoSchema>;

/**
 * A workspace as the title bar shows it.
 *
 * @public
 */
export const WorkspaceRefSchema = z.strictObject({
  id: IdSchema,
  code: WorkspaceCodeSchema,
  color: WorkspaceColorSchema,
  name: z.string(),
});

/**
 * @public
 */
export type WorkspaceRef = z.output<typeof WorkspaceRefSchema>;

/**
 * A project as the title bar shows it.
 *
 * @public
 */
export const ProjectRefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
});

/**
 * @public
 */
export type ProjectRef = z.output<typeof ProjectRefSchema>;

/**
 * What the shell needs on every view. It lives in main, so a reload of the renderer keeps it.
 *
 * @public
 */
export const ShellStateSchema = z.strictObject({
  workspace: WorkspaceRefSchema.nullable(),
  project: ProjectRefSchema.nullable(),

  /**
   * What the title bar says about the active AI provider, or `null` when none is set up.
   */
  provider: z.string().nullable(),

  /**
   * Controls that write leave their change set in Review, and nothing reaches the repository.
   */
  dryRun: z.boolean(),

  /**
   * How many change sets wait in Review for the open workspace.
   */
  pendingChanges: z.number().int().nonnegative(),
});

/**
 * @public
 */
export type ShellState = z.output<typeof ShellStateSchema>;

/**
 * A folder the user chose in a native dialog or dropped on the app. Later requests name it by its token; the path itself
 * stays in main.
 *
 * @public
 */
export const FolderSelectionSchema = z.strictObject({
  token: z.uuid(),
  displayPath: z.string(),
  name: z.string(),
});

/**
 * @public
 */
export type FolderSelection = z.output<typeof FolderSelectionSchema>;

/**
 * The result of a native folder dialog: a cancelled dialog holds no folder.
 *
 * @public
 */
export const FolderChoiceSchema = z.strictObject({
  folder: FolderSelectionSchema.nullable(),
});

/**
 * @public
 */
export type FolderChoice = z.output<typeof FolderChoiceSchema>;

/**
 * The color mode of the app.
 *
 * @public
 */
export const ColorModeSchema = z.enum(['light', 'dark']);

/**
 * @public
 */
export type ColorMode = z.output<typeof ColorModeSchema>;

/**
 * Settings: application. They live in the user's profile and apply immediately. The cache folder is fixed in the app, and a run from
 * the command line names its own.
 *
 * @public
 */
export const AppSettingsSchema = z.strictObject({
  /**
   * Sets the Dry run switch of the title bar at launch.
   */
  startInDryRun: z.boolean(),

  /**
   * Adds what a run does in detail to its log.
   */
  verboseLog: z.boolean(),

  /**
   * Reuses results of files that did not change.
   */
  cacheResults: z.boolean(),

  /**
   * Follows the system until the user picks a mode.
   */
  colorMode: ColorModeSchema.nullable(),
});

/**
 * @public
 */
export type AppSettings = z.output<typeof AppSettingsSchema>;

/**
 * Settings: application as the view reads them.
 *
 * @public
 */
export const AppSettingsViewSchema = AppSettingsSchema.extend({
  cacheFolder: z.string(),

  /**
   * The mode the app shows right now, which the system decides until the user picks one.
   */
  activeColorMode: ColorModeSchema,
});

/**
 * @public
 */
export type AppSettingsView = z.output<typeof AppSettingsViewSchema>;

/**
 * What became of a file the user saves through a native dialog: where it went, or `null` for a cancelled dialog.
 *
 * @public
 */
export const SavedFileSchema = z.strictObject({
  file: z.string().nullable(),
});

/**
 * @public
 */
export type SavedFile = z.output<typeof SavedFileSchema>;
