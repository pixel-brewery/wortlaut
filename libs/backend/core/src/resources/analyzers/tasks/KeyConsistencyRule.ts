// #region Imports

import { getOtherCatalogLocales } from '../ResourceCatalog';
import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * Represents the result data for key consistency analysis.
 *
 * @public
 */
export interface IKeyConsistencyRuleResultData {

    /**
     * The locale of the resource being analyzed.
     */
    locale: string;

    /**
     * The keys that another locale of the catalog defines and this locale lacks, sorted.
     */
    missingKeys: Array<string>;

    /**
     * Indicates if the locale is empty.
     */
    isEmpty: boolean;

    /**
     * The other locales of the catalog that the locale was compared with, sorted.
     */
    comparedLocales: Array<string>;

}

/**
 * Rule to check that every locale of a catalog defines the same keys.
 *
 * @remarks
 * The rule compares the resource with the other locales of its catalog from `context.resources`: the resources of the
 * same type in the same directory whose file names differ only in the locale segment, such as `lang.de.json` and
 * `lang.nl.json`. It reports every key that another locale defines and the resource lacks. Keys that only the resource
 * defines are reported for the other locales when the rule runs for them.
 *
 * @public
 */
export class KeyConsistencyRule implements IAnalyzerRule<Array<IKeyConsistencyRuleResultData>> {

    /**
     * Executes the key consistency check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The rule result with information about missing keys and empty locales.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IKeyConsistencyRuleResultData>> {
        const locale = context.resource.locale;
        const keys = new Set(context.resource.keys());
        const otherLocales = getOtherCatalogLocales(context.resource, context.resources ?? []);
        const missingKeys = new Set<string>();

        for (const otherLocale of otherLocales) {
            for (const key of otherLocale.keys()) {
                if (!keys.has(key)) {
                    missingKeys.add(key);
                }
            }
        }

        const data: IKeyConsistencyRuleResultData = {
            locale,
            missingKeys: Array.from(missingKeys).sort((a, b) => a.localeCompare(b)),
            isEmpty: keys.size === 0,
            comparedLocales: Array.from(new Set(otherLocales.map((otherLocale) => otherLocale.locale))).sort((a, b) => a.localeCompare(b))
        };
        const success = !data.isEmpty && data.missingKeys.length === 0;

        return {
            resource: context.resource,
            success,
            message: this.createMessage(data),
            data: [data]
        };
    }

    /**
     * @private
     */
    private createMessage(data: IKeyConsistencyRuleResultData): string {
        const messages = new Array<string>();

        if (data.isEmpty) {
            messages.push(`The locale '${data.locale}' contains no keys.`);
        }

        if (data.missingKeys.length > 0) {
            messages.push(`The locale '${data.locale}' is missing ${data.missingKeys.length} key(s) that other locales of its catalog (${data.comparedLocales.join(', ')}) define: ${data.missingKeys.join(', ')}`);
        }

        if (messages.length > 0) {
            return messages.join(' ');
        }

        return data.comparedLocales.length > 0
            ? `The locale '${data.locale}' defines the same keys as the other locales of its catalog (${data.comparedLocales.join(', ')}).`
            : `The locale '${data.locale}' has no other locale in its catalog to compare with.`;
    }

}
