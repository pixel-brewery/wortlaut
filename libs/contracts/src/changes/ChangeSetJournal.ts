// #region Imports

import { z } from 'zod';
import { ChangeSetSourceSchema } from './ChangeSet.js';

// #endregion

/**
 * One file of an apply that is going on: where it goes, what proves which state it is in, and what restores it.
 *
 * @public
 */
export const ChangeSetJournalFileSchema = z.strictObject({

    /**
     * The file that is written, with links resolved.
     */
    target: z.string().min(1),

    /**
     * The file that holds the new content until it is renamed over the target. It always lies beside the target.
     */
    staged: z.string().min(1),

    displayPath: z.string().min(1),
    action: z.enum(['create', 'update']),
    oldHash: z.string().nullable(),
    newHash: z.string(),

    /**
     * The topmost directory this apply created for the file.
     */
    createdDirectory: z.string().nullable(),

    /**
     * The bytes the target held, in Base64, or `null` for a file that did not exist. Set once the apply starts renaming.
     */
    previous: z.string().nullable(),

    /**
     * The permission bits the target had, to restore them with its bytes.
     */
    mode: z.number().int()
        .nonnegative()
        .nullable()
});

/**
 * @public
 */
export type ChangeSetJournalFile = z.output<typeof ChangeSetJournalFileSchema>;

/**
 * What an apply writes to the profile before it touches a file, so the next start can finish or restore a change set when the
 * process dies on the way. `preparing` means no target was replaced yet, `committing` that some may have been.
 *
 * @public
 */
export const ChangeSetJournalSchema = z.strictObject({
    schemaVersion: z.literal(1),
    changeSetId: z.string().regex(/^[A-Za-z0-9-]+$/),
    state: z.enum(['preparing', 'committing']),

    /**
     * The process that writes. While it lives, nobody else touches this journal.
     */
    pid: z.number().int()
        .positive(),
    startedAt: z.iso.datetime(),
    cwd: z.string(),
    source: ChangeSetSourceSchema,
    partial: z.boolean(),
    files: z.array(ChangeSetJournalFileSchema)
});

/**
 * @public
 */
export type ChangeSetJournalEntry = z.output<typeof ChangeSetJournalSchema>;
