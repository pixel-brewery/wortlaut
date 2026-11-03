// #region Imports

import { z } from 'zod';
import { RunCommandNameSchema } from '../../common/CommandName.js';
import { SurfaceSchema } from '../../common/Surface.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * A pending change set in the list of Review.
 *
 * @public
 */
export const ReviewItemSchema = z.strictObject({
    id: IdSchema,
    command: RunCommandNameSchema,
    surface: SurfaceSchema,
    detail: z.string().nullable(),
    createdAt: z.iso.datetime(),
    projectName: z.string().nullable(),

    /**
     * It holds only what a failed or stopped run finished.
     */
    partial: z.boolean(),
    fileCount: z.number().int()
        .nonnegative(),
    findingCount: z.number().int()
        .nonnegative(),

    /**
     * The files that changed since the change set was built, so applying it would fail.
     */
    conflicts: z.array(z.string())
});

/**
 * @public
 */
export type ReviewItem = z.output<typeof ReviewItemSchema>;

/**
 * A line of a diff.
 *
 * @public
 */
export const ReviewLineSchema = z.strictObject({
    kind: z.enum(['context', 'add', 'remove']),
    text: z.string(),
    oldLine: z.number().int()
        .positive()
        .nullable(),
    newLine: z.number().int()
        .positive()
        .nullable()
});

/**
 * @public
 */
export type ReviewLine = z.output<typeof ReviewLineSchema>;

/**
 * A file of a change set with its diff.
 *
 * @public
 */
export const ReviewFileSchema = z.strictObject({
    file: z.string(),
    action: z.enum(['create', 'update']),
    additions: z.number().int()
        .nonnegative(),
    deletions: z.number().int()
        .nonnegative(),
    hasConflict: z.boolean(),
    hunks: z.array(z.strictObject({
        lines: z.array(ReviewLineSchema)
    })),

    /**
     * The diff stops at a bound, so a very big change does not fill the window.
     */
    truncated: z.boolean()
});

/**
 * @public
 */
export type ReviewFile = z.output<typeof ReviewFileSchema>;

/**
 * A pending change set with its diffs and findings.
 *
 * @public
 */
export const ReviewDetailSchema = ReviewItemSchema.extend({
    files: z.array(ReviewFileSchema),
    findings: z.array(z.string())
});

/**
 * @public
 */
export type ReviewDetail = z.output<typeof ReviewDetailSchema>;
