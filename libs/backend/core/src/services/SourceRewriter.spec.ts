// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it } from 'vitest';
import { AngularHTMLDetector } from '../detectors/AngularHTMLDetector';
import { TypeScriptDetector } from '../detectors/TypeScriptDetector';
import { rewriteSource } from './SourceRewriter';

// #endregion

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;

describe('rewriteSource', () => {
  it('replaces a value that an HTML detector found, and only that', () => {
    // arrange
    const content = "<header>\r\n  <h2>{{ 'Ready to record' | translate }}</h2>\r\n</header>\r\n";
    const [found] = new AngularHTMLDetector(LOGGER).detect(content, {
      resourceKey: { prefix: 'loc' },
    });

    // act
    const result = rewriteSource(content, [
      { line: found.lineNumber, ...found.position!, replacement: 'loc.ready.to.record' },
    ]);

    // assert
    expect(result).toBe(
      "<header>\r\n  <h2>{{ 'loc.ready.to.record' | translate }}</h2>\r\n</header>\r\n",
    );
  });

  it('keeps the position of a value that a detector unescapes', () => {
    // arrange
    const content = "const a = t('It\\'s  here ');\n";
    const [found] = new TypeScriptDetector(LOGGER).detect(content);

    // act
    const result = rewriteSource(content, [
      { line: found.lineNumber, ...found.position!, replacement: 'its.here' },
    ]);

    // assert
    expect(found.match.value).toBe("It's  here");
    expect(result).toBe("const a = t('its.here');\n");
  });

  it('replaces several values in one line', () => {
    // arrange
    const content = "f(t('One'), t('Two'));";

    // act
    const result = rewriteSource(content, [
      { line: 1, start: 5, end: 8, raw: 'One', replacement: 'loc.one' },
      { line: 1, start: 15, end: 18, raw: 'Two', replacement: 'loc.two' },
    ]);

    // assert
    expect(result).toBe("f(t('loc.one'), t('loc.two'));");
  });

  it('fails when the line no longer holds the value', () => {
    // act & assert
    expect(() =>
      rewriteSource("t('Changed');", [{ line: 1, start: 3, end: 6, raw: 'One', replacement: 'x' }]),
    ).toThrow("Line 1 no longer holds 'One'.");
  });
});
