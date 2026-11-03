// #region Imports

import { createKeyPattern } from '../../../services/KeyPattern';
import { removePlaceholders } from '../../../services/Placeholders';
import { findCatalogLocale } from '../ResourceCatalog';
import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './interfaces/IAnalyzerRule';

// #endregion

/**
 * A letter of any script.
 */
const LETTER = /\p{L}/u;

/**
 * Represents the result data for missing translations analysis.
 *
 * @public
 */
export interface IMissingTranslationsRuleResultData {

    // #region Properties

    /**
     * The locale of the resource whose values are untranslated.
     */
    locale: string;

    /**
     * The base locale the values were compared with.
     */
    baseLocale: string;

    /**
     * The keys whose value is identical to the value of the base locale, sorted.
     */
    untranslatedKeys: Array<string>;

    // #endregion

}

/**
 * The parameters of the missing translations rule, read from `context.parameters`.
 *
 * @public
 */
export interface IMissingTranslationsRuleParameters {

    /**
     * The locale the other locales are translated from, for example `en`. Without it no values are compared.
     */
    baseLocale?: string;

    /**
     * Patterns of keys whose value may be identical to the base locale's value in every locale. `*` matches any sequence
     * of characters, e.g. `loc.integrations.*.name`.
     */
    identicalKeys?: Iterable<string>;

    /**
     * Values that need no translation and may be identical to the base locale's value, such as brand names, product
     * names, units or abbreviations, e.g. `PDF`.
     */
    identicalValues?: Iterable<string>;

}

/**
 * Rule to check for untranslated values: values of a locale that are identical to the value of the base locale.
 *
 * @remarks
 * The rule compares a resource with the resource of its catalog in the base locale (see `key-consistency` for the
 * catalog) and reports every key whose value equals the base value. It does not report what other rules own: a key
 * missing in the locale (`key-consistency`) and an empty value (`empty-values`). Values without letters apart from
 * placeholders, such as `{0}` or `{0} %`, need no translation and are never reported. Legitimately identical values,
 * such as brand names or units, are declared with `identicalValues` or `identicalKeys`.
 *
 * @public
 */
export class MissingTranslationsRule implements IAnalyzerRule<Array<IMissingTranslationsRuleResultData>> {

    /**
     * Executes the missing translations check.
     *
     * @param context The execution context containing resources and parameters.
     * @returns The rule result with the untranslated keys of the locale.
     */
    public execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<Array<IMissingTranslationsRuleResultData>> {
        const parameters = context.parameters as IMissingTranslationsRuleParameters;
        const locale = context.resource.locale;
        const baseLocale = parameters.baseLocale ?? '';
        const baseResource = baseLocale && baseLocale !== locale
            ? findCatalogLocale(context.resource, context.resources ?? [], baseLocale)
            : null;

        if (!baseResource) {
            return {
                resource: context.resource,
                success: true,
                message: this.createSkipMessage(locale, baseLocale),
                data: []
            };
        }

        const baseValues = new Map(baseResource.entries());
        const identicalKeys = Array.from(parameters.identicalKeys ?? [], (pattern) => createKeyPattern(pattern));
        const identicalValues = new Set(parameters.identicalValues ?? []);
        const untranslatedKeys = context.resource.entries()
            .filter(([key, value]) => value !== '' && value === baseValues.get(key))
            .filter(([, value]) => LETTER.test(removePlaceholders(value)) && !identicalValues.has(value))
            .map(([key]) => key)
            .filter((key) => !identicalKeys.some((pattern) => pattern.test(key)))
            .sort((a, b) => a.localeCompare(b));

        if (untranslatedKeys.length === 0) {
            return {
                resource: context.resource,
                success: true,
                message: `The locale '${locale}' has no value identical to the base locale '${baseLocale}'.`,
                data: []
            };
        }

        return {
            resource: context.resource,
            success: false,
            message: `The locale '${locale}' has ${untranslatedKeys.length} value(s) identical to the base locale '${baseLocale}': ${untranslatedKeys.join(', ')}. Translate them, or declare values that need no translation with identicalValues or identicalKeys.`,
            data: [{
                locale,
                baseLocale,
                untranslatedKeys
            }]
        };
    }

    /**
     * @private
     */
    private createSkipMessage(locale: string, baseLocale: string): string {
        if (!baseLocale) {
            return 'No base locale is configured, so no values were compared.';
        }

        if (baseLocale === locale) {
            return `The locale '${locale}' is the base locale; the other locales are compared with it.`;
        }

        return `The catalog has no resource in the base locale '${baseLocale}', so the values of '${locale}' were not compared.`;
    }

}
