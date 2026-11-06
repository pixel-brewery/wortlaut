// #region Imports

import { z } from 'zod';
import { EffectiveSettingSchema } from '../../settings/EffectiveSetting.js';

// #endregion

/**
 * The effective settings of a project. A source file is named as a display path, relative to its workspace.
 *
 * @public
 */
export const EffectiveSettingsSchema = z.strictObject({
  settings: z.array(EffectiveSettingSchema),
  warnings: z.array(z.string()),
});

/**
 * @public
 */
export type EffectiveSettings = z.output<typeof EffectiveSettingsSchema>;

/**
 * The file most values of a project come from, with secrets masked. A project without a file of its own has none.
 *
 * @public
 */
export const SettingsSourceFileSchema = z.strictObject({
  file: z
    .strictObject({
      name: z.string(),
      text: z.string(),
      truncated: z.boolean(),
    })
    .nullable(),
});

/**
 * @public
 */
export type SettingsSourceFile = z.output<typeof SettingsSourceFileSchema>;

/**
 * A copyable command.
 *
 * @public
 */
export const LabeledCommandSchema = z.strictObject({
  label: z.string(),
  command: z.string(),
});

/**
 * @public
 */
export type LabeledCommand = z.output<typeof LabeledCommandSchema>;

/**
 * The Nx side of a project: targets found through the executor, the commands they answer to and the scripts that call
 * them. Reading it changes nothing in the user's setup.
 *
 * @public
 */
export const NxTargetsSchema = z.strictObject({
  executor: z.string().nullable(),
  target: z.string().nullable(),
  projectCount: z.number().int().nonnegative(),
  commands: z.array(LabeledCommandSchema),
  scripts: z.array(LabeledCommandSchema),

  /**
   * The same settings as a `wortlaut.config.json`.
   */
  configPreview: z.string(),
});

/**
 * @public
 */
export type NxTargets = z.output<typeof NxTargetsSchema>;
