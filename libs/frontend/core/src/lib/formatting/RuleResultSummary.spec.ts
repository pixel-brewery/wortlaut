// #region Imports

import { describe, expect, it } from 'vitest';
import { summarizeRuleResult } from './RuleResultSummary';

// #endregion

describe('summarizeRuleResult', () => {
  it('combines repeated locales across catalogs and keeps every total in the details', () => {
    const locales = [
      { locale: 'de', count: 29 },
      { locale: 'en', count: 29 },
      { locale: 'de', count: 169 },
      { locale: 'en', count: 158 },
      { locale: 'uk', count: 1 },
    ];

    expect(summarizeRuleResult(locales, false)).toEqual({
      label: 'de 198 +2',
      detail: 'de 198 · en 187 · uk 1',
      locale: 'de',
    });
  });

  it('preserves zero, uncounted and locale-independent findings', () => {
    expect(summarizeRuleResult([{ locale: 'de', count: 0 }], false)).toEqual({
      label: 'de 0',
      detail: 'de 0',
      locale: 'de',
    });
    expect(summarizeRuleResult([{ locale: null, count: null }], false)).toEqual({
      label: 'All locales',
      detail: 'All locales',
      locale: null,
    });
    expect(
      summarizeRuleResult(
        [
          { locale: 'de', count: null },
          { locale: 'de', count: 7 },
        ],
        false,
      ),
    ).toEqual({ label: 'de 7+', detail: 'de 7+', locale: 'de' });
  });

  it('keeps the outcome when there are no per-locale findings', () => {
    expect(summarizeRuleResult([], false)).toEqual({
      label: 'Failed',
      detail: 'Failed',
      locale: null,
    });
    expect(summarizeRuleResult([{ locale: 'de', count: 7 }], true)).toEqual({
      label: 'Pass',
      detail: 'Pass',
      locale: null,
    });
  });
});
