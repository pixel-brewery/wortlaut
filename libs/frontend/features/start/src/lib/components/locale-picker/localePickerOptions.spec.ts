// #region Imports

import { describe, expect, it } from 'vitest';
import { localePickerOptions, selectedLocaleCodes } from './localePickerOptions';

// #endregion

describe('localePickerOptions', () => {
  it('offers all ISO language identifiers without aliasing their codes', () => {
    const codes = localePickerOptions([]).map((language) => language.code);

    expect(codes).toHaveLength(184);
    expect(new Set(codes).size).toBe(184);
    expect(codes).toEqual(expect.arrayContaining(['aa', 'bh', 'de', 'en', 'tl', 'zh', 'zu']));
  });

  it('finds English language names and codes without case or outer whitespace sensitivity', () => {
    expect(localePickerOptions([], '  GERMAN ')).toEqual([{ code: 'de', name: 'German' }]);
    expect(localePickerOptions([], 'zu').some((language) => language.code === 'zu')).toBe(true);
  });

  it('excludes exact existing identifiers while leaving regional project locales distinct', () => {
    const options = localePickerOptions([' EN ', 'de', 'pt-BR', 'custom']);

    expect(options.some((language) => language.code === 'en')).toBe(false);
    expect(options.some((language) => language.code === 'de')).toBe(false);
    expect(options.some((language) => language.code === 'pt')).toBe(true);
  });

  it('keeps checked languages across searches and rechecks exclusions before confirmation', () => {
    const selected = new Set(['de', 'fr', 'not-a-language']);

    expect(localePickerOptions([], 'German')).toEqual([{ code: 'de', name: 'German' }]);
    expect(selectedLocaleCodes(selected, [])).toEqual(['fr', 'de']);
    expect(selectedLocaleCodes(selected, ['DE'])).toEqual(['fr']);
  });
});
