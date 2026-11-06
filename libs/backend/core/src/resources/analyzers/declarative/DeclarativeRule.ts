// #region Imports

import { matchesKeyGlob } from '../../../services/KeyGlob';
import { comparePlaceholders } from '../../../services/Placeholders';
import type { IResourceInfo } from '../../models/interfaces/IResourceInfo';
import type { RuleSeverity } from '../findings/RuleFinding';
import { findCatalogLocale } from '../ResourceCatalog';
import type {
  IAnalyzerRule,
  IAnalyzerRuleExecutionContext,
  IAnalyzerRuleResult,
} from '../tasks/interfaces/IAnalyzerRule';
import { findIcuProblem } from './IcuMessage';
import { PatternGuard } from './PatternGuard';

// #endregion

/**
 * How long a value may be where a finding quotes it.
 */
const MAX_QUOTE = 200;

/**
 * Base values shorter than this say nothing about a layout.
 */
const DEFAULT_MIN_BASE_LENGTH = 8;

/**
 * The characters that end a sentence, in one spelling each.
 */
const FINAL_PUNCTUATION: ReadonlyArray<readonly [ending: string, spelling: string]> = [
  ['...', '…'],
  ['…', '…'],
  ['.', '.'],
  ['。', '.'],
  ['．', '.'],
  ['!', '!'],
  ['！', '!'],
  ['?', '?'],
  ['？', '?'],
  [':', ':'],
  ['：', ':'],
  [';', ';'],
  ['；', ';'],
];

/**
 * A check of the engine that a pack can name. A pack cannot bring one of its own.
 *
 * @public
 */
export type NamedCheck =
  | { name: 'icu-parsing' }
  | { name: 'placeholder-comparison' }
  | { name: 'length-ratio'; maxRatio: number; minBaseLength?: number }
  | { name: 'punctuation' };

/**
 * A rule as data: exactly one of a pattern, a limit or a named check, with what it says and what it is worth.
 *
 * @public
 */
export interface IDeclarativeRuleDefinition {
  id: string;
  description?: string;
  severity?: RuleSeverity;
  title?: string;
  message: string;
  passTitle?: string;
  passMessage?: string;
  column?: string;
  scope?: {
    keys?: ReadonlyArray<string>;
    locales?: ReadonlyArray<string>;
  };
  pattern?: {
    regex: string;
    flags?: string;
    target?: 'value' | 'key';
    when?: 'match' | 'no-match';
  };
  limit?: {
    minLength?: number;
    maxLength?: number;
  };
  check?: NamedCheck;
}

/**
 * What a declarative rule found in a resource.
 *
 * @public
 */
export interface IDeclarativeRuleData {
  locale: string;
  baseLocale: string | null;

  /**
   * The keys it found, sorted.
   */
  keys: Array<string>;

  /**
   * What it says about each of them.
   */
  rows: Array<{ key: string; detail: string }>;

  /**
   * Why it could not finish, for a pattern that ran too long.
   */
  stopped?: string;
}

/**
 * What a declarative rule gets besides its definition.
 *
 * @public
 */
export interface IDeclarativeRuleOptions {
  /**
   * The name of the pack, which the rule says it comes from.
   */
  pack: string;

  /**
   * Bounds the patterns. All rules of one analysis share one.
   */
  guard: PatternGuard;
}

/**
 * What a rule reads about one key.
 */
interface IRuleEntry {
  key: string;
  value: string;
  base: string | null;
}

/**
 * Evaluates a rule that is data: patterns, limits, messages and severities, plus the named checks of the engine. Rules from a
 * pack and built-in rules share `IAnalyzerRule` and one path through the analyzer, and nothing of a pack ever runs as code.
 *
 * @public
 */
export class DeclarativeRule implements IAnalyzerRule<Array<IDeclarativeRuleData>> {
  // #region Fields

  private readonly _definition: IDeclarativeRuleDefinition;
  private readonly _options: IDeclarativeRuleOptions;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `DeclarativeRule` class.
   *
   * @public
   * @param definition The rule.
   * @param options What it gets besides its definition.
   */
  public constructor(definition: IDeclarativeRuleDefinition, options: IDeclarativeRuleOptions) {
    this._definition = definition;
    this._options = options;
  }

  // #endregion

  // #region Properties

  /**
   * @public
   * @readonly
   * @override
   */
  public get severity(): RuleSeverity | undefined {
    return this._definition.severity;
  }

  // #endregion

  // #region Methods

  /**
   * Evaluates the rule on a resource.
   *
   * @public
   * @param context The execution context.
   * @returns The result.
   * @override
   */
  public execute(
    context: IAnalyzerRuleExecutionContext,
  ): IAnalyzerRuleResult<Array<IDeclarativeRuleData>> {
    const { resource } = context;
    const baseLocale = String(context.parameters.baseLocale ?? '');
    const needsBase = this.needsBase();
    const baseResource =
      needsBase && baseLocale && baseLocale !== resource.locale
        ? findCatalogLocale(resource, context.resources ?? [], baseLocale)
        : null;

    if ((needsBase && !baseResource) || !this.coversLocale(resource.locale)) {
      return this.pass(resource, baseLocale);
    }

    const entries = this.entriesOf(resource, baseResource, context);
    const rows = new Array<{ key: string; detail: string }>();
    const stopped = this.evaluate(entries, rows);

    if (stopped) {
      return this.fail(
        resource,
        baseLocale,
        rows,
        `The rule '${this._definition.id}' did not finish. ${stopped}`,
        stopped,
      );
    }

    if (rows.length === 0) {
      return this.pass(resource, baseLocale);
    }

    return this.fail(
      resource,
      baseLocale,
      rows,
      this.fill(this._definition.message, rows.length, resource.locale, baseLocale),
    );
  }

  /**
   * @private
   */
  private needsBase(): boolean {
    const { check } = this._definition;

    return check !== undefined && check.name !== 'icu-parsing';
  }

  /**
   * @private
   */
  private coversLocale(locale: string): boolean {
    const locales = this._definition.scope?.locales;

    return !locales || locales.includes(locale);
  }

  /**
   * Collects what the rule reads: an empty value belongs to `empty-values`, a key the base lacks to `key-consistency`.
   *
   * @private
   */
  private entriesOf(
    resource: IResourceInfo,
    baseResource: IResourceInfo | null,
    context: IAnalyzerRuleExecutionContext,
  ): Array<IRuleEntry> {
    const keyPatterns = this._definition.scope?.keys;
    const allowed =
      (
        context.parameters.ruleExceptions as
          Readonly<Record<string, ReadonlyArray<string>>> | undefined
      )?.[this._definition.id] ?? [];
    const baseValues = baseResource ? new Map(baseResource.entries()) : null;
    const seen = new Set<string>();
    const entries = new Array<IRuleEntry>();

    for (const [key, value] of resource.entries()) {
      if (
        seen.has(key) ||
        (keyPatterns && !keyPatterns.some((pattern) => matchesKeyGlob(pattern, key))) ||
        allowed.some((pattern) => matchesKeyGlob(pattern, key))
      ) {
        continue;
      }

      seen.add(key);

      const base = baseValues?.get(key) ?? null;

      if (!baseValues || base) {
        entries.push({ key, value, base });
      }
    }

    return entries;
  }

  /**
   * @private
   */
  private evaluate(
    entries: ReadonlyArray<IRuleEntry>,
    rows: Array<{ key: string; detail: string }>,
  ): string | null {
    const { pattern, limit, check } = this._definition;

    if (pattern) {
      return this.evaluatePattern(pattern, entries, rows);
    }

    for (const entry of entries) {
      const detail = limit
        ? this.checkLimit(limit, entry)
        : this.runCheck(check as NamedCheck, entry);

      if (detail !== null) {
        rows.push({ key: entry.key, detail });
      }
    }

    return null;
  }

  /**
   * @private
   */
  private evaluatePattern(
    pattern: NonNullable<IDeclarativeRuleDefinition['pattern']>,
    entries: ReadonlyArray<IRuleEntry>,
    rows: Array<{ key: string; detail: string }>,
  ): string | null {
    const readsKey = pattern.target === 'key';
    const findsMatches = (pattern.when ?? 'match') === 'match';
    const outcome = this._options.guard.test(
      pattern.regex,
      pattern.flags ?? '',
      entries.map((entry) => (readsKey ? entry.key : entry.value)),
    );

    if (outcome.kind === 'stopped') {
      return outcome.reason;
    }

    entries.forEach((entry, index) => {
      if (outcome.matches[index] === findsMatches) {
        rows.push({ key: entry.key, detail: quote(entry.value) });
      }
    });

    return null;
  }

  /**
   * @private
   */
  private checkLimit(
    limit: NonNullable<IDeclarativeRuleDefinition['limit']>,
    entry: IRuleEntry,
  ): string | null {
    const length = Array.from(entry.value).length;

    if (limit.maxLength !== undefined && length > limit.maxLength) {
      return `${length} characters, over the limit of ${limit.maxLength}: ${quote(entry.value)}`;
    }

    return limit.minLength !== undefined && length < limit.minLength
      ? `${length} characters, under the minimum of ${limit.minLength}: ${quote(entry.value)}`
      : null;
  }

  /**
   * Runs a named check on one value.
   *
   * @private
   */
  private runCheck(check: NamedCheck, entry: IRuleEntry): string | null {
    const { value } = entry;
    const base = entry.base ?? '';

    switch (check.name) {
      case 'icu-parsing':
        return value ? findIcuProblem(value) : null;
      case 'placeholder-comparison':
        return value ? this.comparePlaceholders(base, value) : null;
      case 'length-ratio': {
        const baseLength = Array.from(base).length;
        const isLong =
          baseLength >= (check.minBaseLength ?? DEFAULT_MIN_BASE_LENGTH) &&
          Array.from(value).length > baseLength * check.maxRatio;

        return isLong ? `${quote(base)} / ${quote(value)}` : null;
      }
      default:
        return value && finalPunctuationOf(value) !== finalPunctuationOf(base)
          ? `${quote(base)} / ${quote(value)}`
          : null;
    }
  }

  /**
   * @private
   */
  private comparePlaceholders(base: string, value: string): string | null {
    const { missing, added } = comparePlaceholders(base, value);
    const parts = [
      missing.length > 0 ? `Lost ${missing.join(', ')}` : '',
      added.length > 0 ? `Added ${added.join(', ')}` : '',
    ].filter((part) => part.length > 0);

    return parts.length > 0 ? parts.join('. ') : null;
  }

  /**
   * @private
   */
  private pass(
    resource: IResourceInfo,
    baseLocale: string,
  ): IAnalyzerRuleResult<Array<IDeclarativeRuleData>> {
    const { passMessage, description } = this._definition;

    return {
      resource,
      success: true,
      message: this.fill(
        passMessage ?? description ?? `The rule '${this._definition.id}' found nothing.`,
        0,
        resource.locale,
        baseLocale,
      ),
      data: [],
      presentation: this.presentation(true),
    };
  }

  /**
   * @private
   */
  private fail(
    resource: IResourceInfo,
    baseLocale: string,
    rows: Array<{ key: string; detail: string }>,
    message: string,
    stopped?: string,
  ): IAnalyzerRuleResult<Array<IDeclarativeRuleData>> {
    const sorted = [...rows].sort((a, b) => a.key.localeCompare(b.key));

    return {
      resource,
      success: false,
      message,
      data: [
        {
          locale: resource.locale,
          baseLocale: this.needsBase() ? baseLocale : null,
          keys: sorted.map((row) => row.key),
          rows: sorted,
          ...(stopped ? { stopped } : {}),
        },
      ],
      presentation: this.presentation(false),
    };
  }

  /**
   * What a surface shows about this rule. The title stays a template, because the count is the one of all locales.
   *
   * @private
   */
  private presentation(passed: boolean): NonNullable<IAnalyzerRuleResult['presentation']> {
    const { id, title, passTitle, column } = this._definition;

    return {
      pack: this._options.pack,
      title: (passed ? passTitle : title) ?? id,
      column: column ?? 'Found',
    };
  }

  /**
   * @private
   */
  private fill(template: string, count: number, locale: string, baseLocale: string): string {
    return fillRuleMessage(template, { count, locale, baseLocale });
  }

  // #endregion
}

/**
 * Fills in a message of a pack. It replaces plain text, so nothing in a message can act as a pattern.
 *
 * @public
 * @param template The message with `{count}`, `{locale}` and `{baseLocale}`.
 * @param values The values.
 * @param values.count How many things the rule found.
 * @param values.locale The locale.
 * @param values.baseLocale The base locale.
 * @returns The message.
 */
export function fillRuleMessage(
  template: string,
  values: { count: number; locale: string; baseLocale: string },
): string {
  return template
    .split('{count}')
    .join(String(values.count))
    .split('{locale}')
    .join(values.locale)
    .split('{baseLocale}')
    .join(values.baseLocale);
}

/**
 * Returns how a value ends, in one spelling.
 *
 * @private
 */
function finalPunctuationOf(value: string): string {
  const trimmed = value.trimEnd();

  return FINAL_PUNCTUATION.find(([ending]) => trimmed.endsWith(ending))?.[1] ?? '';
}

/**
 * @private
 */
function quote(value: string): string {
  return value.length > MAX_QUOTE ? `${value.slice(0, MAX_QUOTE)}…` : value;
}
