/** Maximum text rendered at once, including logs without line breaks. */
export const TEXT_PAGE_SIZE = 32 * 1024;

/** A bounded part of a text, with a zero-based page index. */
export interface ITextPage {
  readonly text: string;
  readonly page: number;
  readonly count: number;
}

/** Keeps every character reachable without splitting a Unicode surrogate pair between pages. */
export function textPage(text: string, requestedPage: number): ITextPage {
  const count = Math.max(1, Math.ceil(text.length / TEXT_PAGE_SIZE));
  const page = Math.max(
    0,
    Math.min(count - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0),
  );
  let start = page * TEXT_PAGE_SIZE;
  let end = Math.min(text.length, start + TEXT_PAGE_SIZE);
  const cutsPair = (index: number): boolean =>
    index > 0 &&
    index < text.length &&
    text.charCodeAt(index - 1) >= 0xd800 &&
    text.charCodeAt(index - 1) <= 0xdbff &&
    text.charCodeAt(index) >= 0xdc00 &&
    text.charCodeAt(index) <= 0xdfff;

  if (cutsPair(start)) {
    start--;
  }
  if (cutsPair(end)) {
    end--;
  }

  return { text: text.slice(start, end), page, count };
}
