// #region Imports

import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result data for duplicate keys analysis.
 *
 * @public
 */
export interface IDuplicateKeysRuleData {

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
 * Rule to check for duplicate keys in resources.
 *
 * @public
 */
export class DuplicateKeysRule implements IAnalyzerRule<Array<IDuplicateKeysRuleData>> {

    /**
     * Executes the duplicate keys check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The rule result with duplicate key information.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IDuplicateKeysRuleData>> {
        const results: Array<IDuplicateKeysRuleData> = [];
        const keys = context.resource.keys();
        const duplicates = keys.filter((key, index, arr) => arr.indexOf(key) !== index);

        if (duplicates.length > 0) {
            results.push({
                locale: context.resource.locale,
                duplicates
            });
        }

        const success = results.length === 0;
        const message = success
            ? `No duplicate keys were found in the resource '${context.resource.locale}'.`
            : `The resource '${context.resource.locale}' contains duplicate keys: ${duplicates.join(', ')}. Duplicate keys can lead to unexpected behavior or conflicts in translations.`;

        return {
            resource: context.resource,
            success,
            message,
            data: results
        };
    }

}
