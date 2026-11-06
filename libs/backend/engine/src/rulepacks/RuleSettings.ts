// #region Imports

import type { ProjectOptions, RuleSeverity } from '@pixel-brewery/wortlaut-contracts';
import { BUILT_IN_RULE_SEVERITIES } from '@pixel-brewery/wortlaut-core';

// #endregion

/**
 * What each built-in rule looks for.
 */
const BUILT_IN_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'duplicate-keys': 'A key is defined twice in one file.',
  'duplicate-values': 'Different keys carry the same text.',
  'empty-values': 'A key exists but has no text.',
  'key-consistency': 'A locale lacks keys that another one defines.',
  'missing-translations': 'A value is identical to the base locale.',
  'multiple-key-usage': 'A key appears more than once in a resource.',
  'unused-keys': 'No source below the root uses the key.',
};

/**
 * The severity of a rule is the one value behind the switch of a rule in Settings: project and its severity in Rule packs. A list
 * of rules from older configuration keeps meaning that the rules it leaves out do not run.
 *
 * @internal
 */
export namespace RuleSettings {
  /**
   * Returns what a built-in rule looks for.
   *
   * @param id The rule.
   * @returns The description.
   */
  export function descriptionOf(id: string): string {
    return BUILT_IN_DESCRIPTIONS[id] ?? '';
  }

  /**
   * Returns what a rule is worth in a project.
   *
   * @param options The options of the project.
   * @param id The rule.
   * @param own What the rule says about itself, for a rule of a pack.
   * @returns The severity.
   */
  export function severityOf(
    options: ProjectOptions,
    id: string,
    own?: RuleSeverity,
  ): RuleSeverity {
    const analyze = options.actions?.analyze;
    const configured = analyze?.severities?.[id];
    const isBuiltIn = Object.hasOwn(BUILT_IN_RULE_SEVERITIES, id);

    if (configured) {
      return configured;
    }

    if (isBuiltIn && (analyze?.rules?.length ?? 0) > 0 && !analyze?.rules?.includes(id)) {
      return 'off';
    }

    return own ?? BUILT_IN_RULE_SEVERITIES[id] ?? 'warning';
  }

  /**
   * Works out the settings that give a rule a severity.
   *
   * @param options The options of the project.
   * @param id The rule.
   * @param severity The new severity.
   * @returns The edits. A list of rules that leaves out a rule that should run gets it added.
   */
  export function editsFor(
    options: ProjectOptions,
    id: string,
    severity: RuleSeverity,
  ): Array<{ key: string; value: unknown }> {
    const edits: Array<{ key: string; value: unknown }> = [
      { key: `actions.analyze.severities.${id}`, value: severity },
    ];
    const rules = options.actions?.analyze?.rules ?? [];

    if (
      severity !== 'off' &&
      rules.length > 0 &&
      Object.hasOwn(BUILT_IN_RULE_SEVERITIES, id) &&
      !rules.includes(id)
    ) {
      edits.push({ key: 'actions.analyze.rules', value: [...rules, id] });
    }

    return edits;
  }
}
