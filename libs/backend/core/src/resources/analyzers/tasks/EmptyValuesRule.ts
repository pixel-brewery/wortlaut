// #region Imports

import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result of the EmptyValuesRule execution.
 *
 * @public
 */
export interface IEmptyValuesRuleResultData {

    /**
     * The locale of the resource where empty values were found.
     */
    locale: string;

    /**
     * The list of keys with empty values in the resource.
     */
    keys: Array<string>;

}

/**
 * Rule to check for empty values in resources.
 *
 * @public
 */
export class EmptyValuesRule implements IAnalyzerRule<Array<IEmptyValuesRuleResultData>> {

    /**
     * Executes the empty values check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The Rule result containing information about empty values.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IEmptyValuesRuleResultData>> {
        const results: Array<IEmptyValuesRuleResultData> = [];

        const emptyValues = context.resource.entries().filter((entry) => !entry[1]);

        if (emptyValues.length > 0) {
            results.push({
                locale: context.resource.locale,
                keys: emptyValues.map((entry) => entry[0])
            });
        }

        const success = results.length === 0;
        const message = success
            ? `No empty values were found in the resource '${context.resource.locale}'.`
            : `The resource '${context.resource.locale}' contains empty values for the following keys: ${emptyValues
                .map((entry) => entry[0])
                .join(', ')}. Empty values can lead to incomplete or missing translations.`;

        return {
            resource: context.resource,
            success,
            message,
            data: results
        };
    }

}
