// #region Imports

import type { IAnalyzerRuleResult } from '../tasks/interfaces/IAnalyzerRule';

// #endregion

/**
 * What a rule is worth. `off` means it does not run.
 *
 * @public
 */
export type RuleSeverity = 'error' | 'warning' | 'off';

/**
 * What one rule found about one thing: the one shape of a finding, for built-in rules and rules of a pack alike.
 *
 * @public
 */
export interface IRuleFinding {
    rule: string;

    /**
     * The key it is about, or `null` when it is about a whole resource.
     */
    key: string | null;
    locale: string;
    message: string;
    severity: Exclude<RuleSeverity, 'off'>;
}

/**
 * What the built-in rules are worth while a project says nothing else.
 *
 * @public
 */
export const BUILT_IN_RULE_SEVERITIES: Readonly<Record<string, Exclude<RuleSeverity, 'off'>>> = {
    'duplicate-keys': 'error',
    'duplicate-values': 'warning',
    'empty-values': 'error',
    'key-consistency': 'error',
    'missing-translations': 'warning',
    'multiple-key-usage': 'warning',
    'unused-keys': 'warning'
};

/**
 * What a rule is worth that says nothing about it.
 */
const DEFAULT_SEVERITY = 'warning';

/**
 * The lists in which the rules report what they found.
 */
const FOUND_LISTS = ['duplicates', 'keys', 'missingKeys', 'multipleUsageKeys', 'unusedKeys', 'untranslatedKeys'];

/**
 * What the built-in rules say about one thing they found.
 */
const FINDING_MESSAGES: Readonly<Record<string, string>> = {
    'duplicate-keys': 'The key is defined more than once.',
    'duplicate-values': 'Several keys carry this text.',
    'empty-values': 'The key has no text.',
    'key-consistency': 'Another locale defines this key, and this one lacks it.',
    'missing-translations': 'The value is identical to the base locale.',
    'multiple-key-usage': 'The key appears more than once in the resource.',
    'unused-keys': 'No source uses the key.'
};

/**
 * Returns what a rule found, from the data of its result.
 *
 * @public
 * @param data The data of a rule result.
 * @returns The things it found, in their order.
 */
export function foundItemsOf(data: unknown): Array<string> {
    const entries = (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown>>;

    return entries.flatMap((entry) => FOUND_LISTS.flatMap((name) => Array.isArray(entry?.[name]) ? entry[name] as Array<string> : []));
}

/**
 * Returns what a rule is worth when it runs: what the project says, what the rule says about itself, or else the default.
 * A rule that is off only runs when someone asked for this run, and then it counts for what it is usually worth.
 *
 * @public
 * @param rule The name of the rule.
 * @param severities What the project says.
 * @param own What the rule says about itself.
 * @returns The severity.
 */
export function severityOfRule(rule: string, severities?: Readonly<Record<string, RuleSeverity>>, own?: RuleSeverity): Exclude<RuleSeverity, 'off'> {
    const configured = severities?.[rule];

    if (configured && configured !== 'off') {
        return configured;
    }

    return (own && own !== 'off' ? own : undefined) ?? BUILT_IN_RULE_SEVERITIES[rule] ?? DEFAULT_SEVERITY;
}

/**
 * Turns the result of a rule into findings in the one shape.
 *
 * @public
 * @param rule The name of the rule.
 * @param result The result.
 * @param severity What the rule is worth.
 * @returns One finding per thing it found, or one for the resource when it names none.
 */
export function createRuleFindings(rule: string, result: IAnalyzerRuleResult, severity: Exclude<RuleSeverity, 'off'>): Array<IRuleFinding> {
    if (result.success) {
        return [];
    }

    const locale = result.resource.locale;
    const items = foundItemsOf(result.data);

    return items.length === 0
        ? [{ rule, key: null, locale, message: result.message, severity }]
        : items.map((key) => ({ rule, key, locale, message: FINDING_MESSAGES[rule] ?? result.message, severity }));
}
