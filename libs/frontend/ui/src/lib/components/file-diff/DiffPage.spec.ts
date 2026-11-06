import type { ReviewFile } from '@pixel-brewery/wortlaut-contracts';
import { describe, expect, it } from 'vitest';
import { DIFF_PAGE_SIZE, diffPage } from './DiffPage';

function fileWithHunks(...counts: Array<number>): ReviewFile {
  let nextLine = 1;

  return {
    file: 'catalog.json',
    action: 'update',
    additions: 0,
    deletions: 0,
    hasConflict: false,
    truncated: false,
    hunks: counts.map((count) => ({
      lines: Array.from({ length: count }, () => ({
        kind: 'context',
        text: `Line ${nextLine}`,
        oldLine: nextLine,
        newLine: nextLine++,
      })),
    })),
  };
}

describe('diffPage', () => {
  it('bounds rendered lines while preserving hunk boundaries and line numbers', () => {
    const file = fileWithHunks(150, 150, 150);
    const first = diffPage(file, 0);
    const second = diffPage(file, 1);
    const last = diffPage(file, 100);

    expect(first.hunks.map((hunk) => hunk.lines.length)).toEqual([150, 50]);
    expect(second.hunks.flatMap((hunk) => hunk.lines).length).toBe(DIFF_PAGE_SIZE);
    expect(second.hunks[0].lines[0]).toBe(file.hunks[1].lines[50]);
    expect(last.page).toBe(2);
    expect(last.total).toBe(450);
    expect(last.hunks[0].lines.at(-1)?.newLine).toBe(450);
    expect(
      [first, second, last].flatMap((page) => page.hunks.flatMap((hunk) => hunk.lines)),
    ).toEqual(file.hunks.flatMap((hunk) => hunk.lines));
  });

  it('clamps stale pages when a new file has fewer lines', () => {
    expect(diffPage(fileWithHunks(3), 20).page).toBe(0);
    expect(diffPage(fileWithHunks(), Number.NaN)).toEqual({ hunks: [], page: 0, total: 0 });
  });
});
