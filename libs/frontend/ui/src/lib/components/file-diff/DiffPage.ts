import type { ReviewFile } from '@pixel-brewery/wortlaut-contracts';

/** Maximum diff lines mounted at once for a file preview. */
export const DIFF_PAGE_SIZE = 200;

/** A page preserves hunk boundaries and the original old/new line numbers. */
export interface IDiffPage {
    readonly hunks: ReviewFile['hunks'];
    readonly page: number;
    readonly total: number;
}

/** Projects a bounded part of the diff without changing the underlying change set. */
export function diffPage(file: ReviewFile, requestedPage: number): IDiffPage {
    const total = file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
    const lastPage = Math.max(0, Math.ceil(total / DIFF_PAGE_SIZE) - 1);
    const page = Math.max(0, Math.min(lastPage, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
    const start = page * DIFF_PAGE_SIZE;
    const end = start + DIFF_PAGE_SIZE;
    const hunks: ReviewFile['hunks'] = [];
    let offset = 0;

    for (const hunk of file.hunks) {
        const lines = hunk.lines.slice(Math.max(0, start - offset), Math.max(0, end - offset));

        if (lines.length > 0) {
            hunks.push({ lines });
        }
        offset += hunk.lines.length;
    }

    return { hunks, page, total };
}
