// #region Imports

import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result data for duplicate values analysis.
 *
 * @public
 */
export interface IDuplicateValuesRuleData {

    // #region Properties

    /**
     * The locale of the resource where duplicates were found.
     */
    locale: string;

    /**
     * The list of duplicate keys in the resource.
     */
    duplicates: Array<string>;

    // #endregion

}

/**
 * Rule to check for duplicate values in resources.
 *
 * @description
 * This rule analyzes the values in a resource and identifies any duplicates.
 * Background: Duplicate values can lead to unexpected behavior or conflicts in translations.
 * It is important to ensure that each value is unique to maintain clarity and consistency in translations.
 *
 * @example
 * 'loc.dialog.dismiss' = 'Dismiss';
 * 'loc.view.dismiss' = 'Dismiss'; // This would be flagged as a duplicate value.
 *
 * @public
 */
export class DuplicateValuesRule implements IAnalyzerRule<Array<IDuplicateValuesRuleData>> {

    /**
     * Executes the duplicate values check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The rule result with duplicate value information.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IDuplicateValuesRuleData>> {
        const results: Array<IDuplicateValuesRuleData> = [];
        const values = context.resource.values();
        const duplicates = values.filter((key, index, arr) => arr.indexOf(key) !== index);

        if (duplicates.length > 0) {
            results.push({
                locale: context.resource.locale,
                duplicates
            });
        }

        const success = results.length === 0;
        const message = success
            ? `No duplicate values were found in the resource '${context.resource.locale}'.`
            : `The resource '${context.resource.locale}' contains duplicate values: ${duplicates.join(', ')}. Duplicate values can lead to unexpected behavior or conflicts in translations.`;

        return {
            resource: context.resource,
            success,
            message,
            data: results
        };
    }

}
