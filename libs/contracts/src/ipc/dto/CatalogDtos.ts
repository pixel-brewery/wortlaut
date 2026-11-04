// #region Imports

import { z } from 'zod';
import { ResourceFormatSchema } from '../../settings/ProjectOptions.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * Everything the frame of Translations shows.
 *
 * @public
 */
export const CatalogOverviewSchema = z.strictObject({
    prefix: z.string(),
    baseLocale: z.string(),
    locales: z.array(z.strictObject({ code: z.string(), file: z.string().nullable() })),
    format: ResourceFormatSchema,
    commentsSupported: z.boolean(),
    keyCount: z.number().int()
        .nonnegative(),
    fileCount: z.number().int()
        .nonnegative(),
    namespaces: z.array(z.strictObject({
        name: z.string(),
        count: z.number().int()
            .nonnegative()
    }))
});

/**
 * @public
 */
export type CatalogOverview = z.output<typeof CatalogOverviewSchema>;

/**
 * The filters of the table of keys.
 *
 * @public
 */
export const CatalogFilterSchema = z.enum(['all', 'duplicates', 'unused', 'placeholders']);

/**
 * @public
 */
export type CatalogFilter = z.output<typeof CatalogFilterSchema>;

/**
 * Asks for the rows of the table of keys.
 *
 * @public
 */
export const CatalogKeysRequestSchema = z.strictObject({
    projectId: IdSchema,
    namespace: z.string().max(300)
        .nullable(),
    search: z.string().max(300),
    filter: CatalogFilterSchema,
    targetLocale: z.string().max(40)
        .nullable(),
    offset: z.number().int()
        .nonnegative()
        .default(0),
    limit: z.number().int()
        .positive()
        .max(5000)
});

/**
 * A row of the table of keys.
 *
 * @public
 */
export const CatalogKeyRowSchema = z.strictObject({
    key: z.string(),
    flags: z.array(z.enum(['duplicate', 'unused', 'placeholder'])),
    base: z.string(),
    target: z.string().nullable()
});

/**
 * @public
 */
export type CatalogKeyRow = z.output<typeof CatalogKeyRowSchema>;

/**
 * The rows of the table of keys.
 *
 * @public
 */
export const CatalogKeysSchema = z.strictObject({
    rows: z.array(CatalogKeyRowSchema),

    /**
     * How many keys match the filter and the search.
     */
    matching: z.number().int()
        .nonnegative(),

    /**
     * How many keys the namespace holds.
     */
    total: z.number().int()
        .nonnegative()
});

/**
 * @public
 */
export type CatalogKeys = z.output<typeof CatalogKeysSchema>;

/**
 * Everything the details of a key show.
 *
 * @public
 */
export const CatalogKeyDetailSchema = z.strictObject({
    key: z.string(),
    base: z.string(),
    target: z.string().nullable(),

    /**
     * The comment of the target locale, or `null` when the catalog format has no place for one.
     */
    comment: z.string().nullable(),
    findings: z.array(z.string()),
    usages: z.array(z.strictObject({
        file: z.string(),
        line: z.number().int()
            .positive()
    }))
});

/**
 * @public
 */
export type CatalogKeyDetail = z.output<typeof CatalogKeyDetailSchema>;
