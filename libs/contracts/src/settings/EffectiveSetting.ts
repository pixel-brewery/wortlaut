// #region Imports

import { z } from 'zod';

// #endregion

/**
 * Where the value of a setting comes from. `.env` only fills tokens, so a token stays the value of the file that holds it.
 *
 * @public
 */
export const SettingSourceKindSchema = z.enum([
    'default',
    'nx-target-defaults',
    'project-json',
    'nx-configuration',
    'wortlaut-config',
    'localizator-config',
    'arguments',
    'lock-file'
]);

/**
 * @public
 */
export type SettingSourceKind = z.output<typeof SettingSourceKindSchema>;

/**
 * The source of a value: its kind and, for a file, the file.
 *
 * @public
 */
export const SettingSourceSchema = z.strictObject({
    kind: SettingSourceKindSchema,

    /**
     * The absolute path of the file, or `null` for defaults and arguments.
     */
    file: z.string().nullable()
});

/**
 * @public
 */
export type SettingSource = z.output<typeof SettingSourceSchema>;

/**
 * One setting of a project with its value and where that value comes from. A secret shows its token or a mask, never
 * its value.
 *
 * @public
 */
export const EffectiveSettingSchema = z.strictObject({
    key: z.string(),
    value: z.unknown(),
    secret: z.boolean(),
    source: SettingSourceSchema
});

/**
 * @public
 */
export type EffectiveSetting = z.output<typeof EffectiveSettingSchema>;
