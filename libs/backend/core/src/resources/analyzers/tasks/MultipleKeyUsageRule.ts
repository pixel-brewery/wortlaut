// #region Imports

import type {
  IAnalyzerRule,
  IAnalyzerRuleExecutionContext,
  IAnalyzerRuleResult,
} from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result data for multiple key usage analysis.
 *
 * @public
 */
export interface IMultipleKeyUsageRuleResultData {
  /**
   * The locale of the resource where keys were used multiple times.
   */
  locale: string;

  /**
   * The list of keys that are used multiple times in the resource.
   */
  multipleUsageKeys: Array<string>;
}

/**
 * Rule to detect keys that are used more than once within a resource.
 *
 * @public
 */
export class MultipleKeyUsageRule implements IAnalyzerRule<Array<IMultipleKeyUsageRuleResultData>> {
  // #region Methods

  /**
   * Executes the multiple key usage check.
   *
   * @param context The execution context containing resources and parameters.
   * @returns The Rule result containing information about keys used multiple times.
   */
  public execute(
    context: IAnalyzerRuleExecutionContext,
  ): IAnalyzerRuleResult<Array<IMultipleKeyUsageRuleResultData>> {
    const results: Array<IMultipleKeyUsageRuleResultData> = [];
    let success = true;
    let message = 'No keys are used multiple times in resources.';

    const keyUsageCount: Record<string, number> = {};

    // Count occurrences of each key
    context.resource.keys().forEach((key) => {
      keyUsageCount[key] = (keyUsageCount[key] || 0) + 1;
    });

    // Identify keys with multiple usages
    const multipleUsageKeys = Object.entries(keyUsageCount)
      .filter(([, count]) => count > 1)
      .map(([key]) => key);

    if (multipleUsageKeys.length > 0) {
      results.push({
        locale: context.resource.locale,
        multipleUsageKeys,
      });

      success = false;
      message = `Resource '${context.resource.locale}' has keys used multiple times: ${multipleUsageKeys.join(', ')}.`;
    }

    return {
      resource: context.resource,
      success,
      message,
      data: results,
    };
  }

  // #endregion
}
