// #region Imports

import { z } from 'zod';
import { findSecretNames } from '../common/Secrets.js';
import { PresetSchema } from '../settings/ProjectOptions.js';
import { WorkspaceCodeSchema, WorkspaceColorSchema } from './WorkspaceRecord.js';

// #endregion

/**
 * The value `format` holds in a file of a workspace.
 *
 * @public
 */
export const WORKSPACE_EXPORT_FORMAT = 'wortlaut-workspace';

/**
 * Text of a file that came from somewhere else. It reaches a window, so it holds no control characters.
 */
function fileText(max: number): z.ZodString {
  return (
    z
      .string()
      .min(1)
      .max(max)
      // eslint-disable-next-line no-control-regex
      .regex(/^[^\u0000-\u001f\u007f-\u009f]*$/, 'Control characters are not allowed.')
  );
}

/**
 * A locale in a file of a workspace.
 */
const LocaleSchema = z
  .string()
  .regex(/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/)
  .max(40);

/**
 * A pack a workspace had pinned: a reference, because the pin itself lives in the lock file of each repository.
 *
 * @public
 */
export const WorkspaceExportPackSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .max(64),
  name: fileText(120),
  source: fileText(512),
  version: fileText(64).nullable(),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/)
    .nullable(),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

/**
 * @public
 */
export type WorkspaceExportPack = z.output<typeof WorkspaceExportPackSchema>;

/**
 * The file that moves a workspace: its settings, the names of its repositories and references to its pinned packs. It holds no
 * key, no login and no path: on another computer the user chooses the folders. Every object is strict, so a file that carries
 * more than this is refused, and it is checked like anything else that comes from outside.
 *
 * @public
 */
export const WorkspaceExportSchema = z
  .strictObject({
    format: z.literal(WORKSPACE_EXPORT_FORMAT),
    schemaVersion: z.literal(1),
    workspace: z.strictObject({
      name: fileText(80),
      code: WorkspaceCodeSchema,
      color: WorkspaceColorSchema,
      scanForProjects: z.boolean(),
      defaults: z.strictObject({
        baseLocale: LocaleSchema.nullable(),
        targetLocales: z.array(LocaleSchema).max(64),
        preset: PresetSchema.nullable(),
      }),
      repositories: z.array(z.strictObject({ name: fileText(120) })).max(64),
      packs: z.array(WorkspaceExportPackSchema).max(256),
    }),
  })
  .superRefine((file, context) => {
    for (const name of findSecretNames(file)) {
      context.addIssue({
        code: 'custom',
        message: `A file of a workspace must not hold the secret '${name}'.`,
      });
    }
  });

/**
 * @public
 */
export type WorkspaceExport = z.output<typeof WorkspaceExportSchema>;
