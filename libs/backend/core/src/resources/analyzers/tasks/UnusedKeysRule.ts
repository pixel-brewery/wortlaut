// #region Imports

import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result data for unused keys analysis.
 *
 * @public
 */
export interface IUnusedKeysRuleResultData {

    /**
     * The locale of the resource where unused keys were found.
     */
    locale: string;

    /**
     * The list of unused keys in the resource.
     */
    unusedKeys: Array<string>;

}

/**
 * Rule to check for unused keys in resources.
 * A key of the resource is unused when the `usedKeys` parameter, the keys the sources use, does not contain it.
 * The `UsedKeysFinder` determines these keys.
 *
 * @public
 */
export class UnusedKeysRule implements IAnalyzerRule<Array<IUnusedKeysRuleResultData>> {

    /**
     * Executes the unused keys check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The rule result containing information about unused keys.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IUnusedKeysRuleResultData>> {
        const usedKeys = context.parameters.usedKeys as Iterable<string> | undefined;
        if (!usedKeys) {
            throw new Error('Missing "usedKeys" parameter in execution context.');
        }

        const results: Array<IUnusedKeysRuleResultData> = [];
        const used = new Set(usedKeys);
        const unusedKeys = context.resource.keys().filter((key) => !used.has(key));

        let success = true;
        let message = 'No unused keys found in resources.';

        if (unusedKeys.length > 0) {
            results.push({
                locale: context.resource.locale,
                unusedKeys: unusedKeys
            });
            success = false;
            message = `Unused keys found in resource '${context.resource.locale}': ${unusedKeys.length}`;
        }

        return {
            resource: context.resource,
            success,
            message,
            data: results
        };
    }

}
