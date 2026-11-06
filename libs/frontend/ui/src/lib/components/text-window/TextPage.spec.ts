import { describe, expect, it } from 'vitest';
import { TEXT_PAGE_SIZE, textPage } from './TextPage';

describe('textPage', () => {
  it('bounds newline-free text and keeps the complete tail reachable', () => {
    const text = 'x'.repeat(TEXT_PAGE_SIZE * 3) + 'Final failure';
    const first = textPage(text, 0);
    const last = textPage(text, 100);

    expect(first.text.length).toBe(TEXT_PAGE_SIZE);
    expect(first.count).toBe(4);
    expect(last.page).toBe(3);
    expect(last.text).toBe('Final failure');
    expect(
      Array.from({ length: first.count }, (_, page) => textPage(text, page).text).join(''),
    ).toBe(text);
  });

  it('does not lose or duplicate a surrogate pair at a page boundary', () => {
    const text = 'x'.repeat(TEXT_PAGE_SIZE - 1) + '🎧' + 'y'.repeat(TEXT_PAGE_SIZE) + '🎵';
    const pages = Array.from(
      { length: textPage(text, 0).count },
      (_, page) => textPage(text, page).text,
    );

    expect(pages[0].endsWith('x')).toBe(true);
    expect(pages[1].startsWith('🎧')).toBe(true);
    expect(pages.join('')).toBe(text);
    expect(pages.every((page) => page.length <= TEXT_PAGE_SIZE + 1)).toBe(true);
  });

  it('clamps stale pages after the source shrinks and accepts an empty source', () => {
    expect(textPage('Shorter log', 50)).toEqual({ text: 'Shorter log', page: 0, count: 1 });
    expect(textPage('', Number.NaN)).toEqual({ text: '', page: 0, count: 1 });
    expect(textPage('A', -1).page).toBe(0);
  });
});
