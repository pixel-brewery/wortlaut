// #region Imports

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewDetailRequestSchema, type ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { structuredPatch } from 'diff';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';
import { QUIET_LOGGER } from '../io/QuietLogger';
import { ChangeSetBuilder } from './ChangeSetBuilder';
import { ReviewList } from './ReviewList';

// #endregion

vi.mock('diff', async (importOriginal) => {
    const actual = await importOriginal<typeof import('diff')>();

    return { ...actual, structuredPatch: vi.fn(actual.structuredPatch) };
});

describe('ReviewService', () => {
    let root: string;
    let engine: WortlautEngine;
    let list: ReviewList;

    const add = (count: number, newContent = 'after\n'): ChangeSet => {
        const oldContent = 'before\n';
        const files = Array.from({ length: count }, (_, index) => {
            const file = `file-${index}.txt`;
            const path = join(root, file);

            writeFileSync(path, oldContent);

            return {
                path,
                displayPath: file,
                action: 'update' as const,
                oldContent,
                oldHash: ChangeSetBuilder.hash(Buffer.from(oldContent)),
                newContent,
                newHash: ChangeSetBuilder.hash(Buffer.from(newContent))
            };
        });

        return list.add({
            schemaVersion: 1,
            id: 'change-1',
            state: 'proposed',
            createdAt: '2026-11-04T10:00:00.000Z',
            cwd: root,
            source: { command: 'sort', surface: 'desktop', runId: 'run-1', detail: null },
            files,
            findings: [{ rule: 'example-rule', severity: 'warning', message: 'Review the changed files.', file: null, locale: null }],
            partial: false
        });
    };

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-review-pages-')));
        const profileRoot = join(root, 'profile');

        engine = new WortlautEngine({ surface: 'desktop', logger: QUIET_LOGGER, profileRoot, home: root, env: {} });
        list = new ReviewList(join(profileRoot, 'changes'));
        vi.mocked(structuredPatch).mockClear();
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('computes diffs only for the requested file page and retains complete counts', () => {
        // arrange
        add(12);

        // act
        const detail = engine.review.detail('change-1', { fileOffset: 5, fileLimit: 5 });

        // assert
        expect(detail.fileCount).toBe(12);
        expect(detail.files.map((file) => file.file)).toEqual(['file-5.txt', 'file-6.txt', 'file-7.txt', 'file-8.txt', 'file-9.txt']);
        expect(detail.findings).toEqual(['Review the changed files.']);
        expect(structuredPatch).toHaveBeenCalledTimes(5);
    });

    it('reaches the final file without an ever-growing preview request', () => {
        // arrange
        add(12);

        // act
        const detail = engine.review.detail('change-1', { fileOffset: 10, fileLimit: 5 });

        // assert
        expect(detail.files.map((file) => file.file)).toEqual(['file-10.txt', 'file-11.txt']);
        expect(detail.fileCount).toBe(12);
        expect(structuredPatch).toHaveBeenCalledTimes(2);
    });

    it('keeps off-page conflicts in the complete approval boundary', () => {
        // arrange
        add(12);
        writeFileSync(join(root, 'file-11.txt'), 'changed elsewhere\n');

        // act
        const detail = engine.review.detail('change-1', { fileOffset: 0, fileLimit: 5 });

        // assert
        expect(detail.conflicts).toEqual(['file-11.txt']);
        expect(detail.files.every((file) => !file.hasConflict)).toBe(true);
        expect(structuredPatch).toHaveBeenCalledTimes(5);
    });

    it('preserves the complete detail for callers that omit paging', () => {
        // arrange
        add(12);

        // act
        const detail = engine.review.detail('change-1');

        // assert
        expect(detail.files).toHaveLength(12);
        expect(structuredPatch).toHaveBeenCalledTimes(12);
    });

    it('bounds a huge single-line preview while approving the complete file', async () => {
        // arrange
        const content = 'x'.repeat(150 * 1024);
        add(1, content);

        // act
        const detail = engine.review.detail('change-1', { fileOffset: 0, fileLimit: 5 });
        await engine.applyChangeSet('change-1', root);

        // assert
        expect(detail.files[0]).toMatchObject({ additions: 1, deletions: 1, truncated: true });
        expect(detail.files[0].hunks.flatMap((hunk) => hunk.lines).reduce((sum, line) => sum + line.text.length, 0)).toBe(128 * 1024);
        expect(readFileSync(join(root, 'file-0.txt'), 'utf8')).toBe(content);
    });

    it('validates optional IPC page bounds without changing legacy requests', () => {
        // act & assert
        expect(ReviewDetailRequestSchema.safeParse({ id: 'change-1' }).success).toBe(true);
        expect(ReviewDetailRequestSchema.safeParse({ id: 'change-1', fileOffset: 0, fileLimit: 20 }).success).toBe(true);

        for (const invalid of [{ fileOffset: -1 }, { fileOffset: 0.5 }, { fileLimit: 0 }, { fileLimit: 21 }, { fileLimit: 1.5 }]) {
            expect(ReviewDetailRequestSchema.safeParse({ id: 'change-1', ...invalid }).success).toBe(false);
        }
    });
});
