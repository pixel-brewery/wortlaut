// #region Imports

import type { RuleResult } from '@pixel-brewery/wortlaut-contracts';
import { formatCount } from './Format';

// #endregion

/**
 * Summarizes a rule across catalogs without letting its locale list fill the row.
 *
 * @public
 * @param locales - Findings per catalog and locale.
 * @param passed - Whether the rule passed.
 * @returns The first locale's code and label, with additional locale counts and every total for the tooltip.
 */
export function summarizeRuleResult(
  locales: ReadonlyArray<RuleResult['locales'][number]>,
  passed: boolean,
): { label: string; detail: string; locale: string | null } {
  if (passed || locales.length === 0) {
    const label = passed ? 'Pass' : 'Failed';

    return { label, detail: label, locale: null };
  }

  const totals = new Map<string | null, { count: number; known: boolean; unknown: boolean }>();

  for (const entry of locales) {
    const total = totals.get(entry.locale) ?? { count: 0, known: false, unknown: false };

    total.count += entry.count ?? 0;
    total.known ||= entry.count !== null;
    total.unknown ||= entry.count === null;
    totals.set(entry.locale, total);
  }

  const results = [...totals].map(([locale, total]) => {
    const count = total.known ? `${formatCount(total.count)}${total.unknown ? '+' : ''}` : null;

    return [locale ?? 'All locales', count].filter((part) => part !== null).join(' ');
  });

  return {
    label: `${results[0]}${results.length > 1 ? ` +${results.length - 1}` : ''}`,
    detail: results.join(' · '),
    locale: locales[0]?.locale ?? null,
  };
}
