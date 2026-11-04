// #region Imports

import type { ESLint, Linter } from 'eslint';
import { duplicateKeysRule } from './rules/DuplicateKeysRule.js';
import { emptyValuesRule } from './rules/EmptyValuesRule.js';
import { keyConsistencyRule } from './rules/KeyConsistencyRule.js';
import { missingTranslationsRule } from './rules/MissingTranslationsRule.js';
import { unusedKeysRule } from './rules/UnusedKeysRule.js';

// #endregion

/**
 * The namespace of the rules of the plugin in the configurations of this package.
 *
 * @public
 */
export const PLUGIN_NAMESPACE = 'wortlaut';

/**
 * The ESLint plugin with the rules of this package.
 *
 * @remarks
 * Register it under {@link PLUGIN_NAMESPACE} to use the rule ids of the configurations, for example
 * `wortlaut/duplicate-keys`, or use {@link createResourcesConfig}, which registers it.
 *
 * @public
 */
export const plugin: ESLint.Plugin = {
    meta: {
        name: '@pixel-brewery/wortlaut-eslint-rules'
    },
    rules: {
        'duplicate-keys': duplicateKeysRule,
        'empty-values': emptyValuesRule,
        'key-consistency': keyConsistencyRule,
        'missing-translations': missingTranslationsRule,
        'unused-keys': unusedKeysRule
    } as unknown as ESLint.Plugin['rules']
};

/**
 * The options of {@link createResourcesConfig}.
 *
 * @public
 */
export interface IResourcesConfigOptions {

    /**
     * The translation files, for example `['src/i18n/*.json']`. Required, because the rules treat every matched file as
     * a resource whose file name carries its locale (`lang.de.json`), and would otherwise report on `package.json` or
     * `tsconfig.json`.
     */
    files: Array<string>;

    /**
     * The files to exclude from `files`.
     */
    ignores?: Array<string>;

    /**
     * The options of `missing-translations` (`baseLocale`, `identicalKeys`, `identicalValues`), or `false` to disable it.
     */
    missingTranslations?: false | {
        baseLocale?: string;
        identicalKeys?: Array<string>;
        identicalValues?: Array<string>;
    };

    /**
     * The options of `unused-keys`. The rule is disabled unless they are given, because without `usedKeys` every key is
     * unused.
     */
    unusedKeys?: {
        usedKeys: Array<string>;
    };

    /**
     * The severity of the rules. Defaults to `warn`.
     */
    severity?: Linter.StringSeverity;

}

/**
 * Creates the flat configuration of the resource rules for the translation files of a project.
 *
 * @remarks
 * The configuration adds only the rules. The JSON files must be linted with a language or parser of their own, such
 * as the `json/json` language of `@eslint/json` that the `configs.*` of `@pixel-brewery/eslint-config` configure for
 * `**\/*.json`. resx and po files are not supported in the configuration, because no ESLint parser for them is
 * installed; the rules analyze them with a parser whose root node covers the raw text.
 *
 * @example
 * ```js
 * import { configs } from '@pixel-brewery/eslint-config';
 * import { createResourcesConfig } from '@pixel-brewery/wortlaut-eslint-rules';
 *
 * export default [
 *     ...configs.base,
 *     ...createResourcesConfig({ files: ['src/i18n/*.json'] })
 * ];
 * ```
 *
 * @param options The options.
 * @returns The flat configuration.
 * @public
 */
export function createResourcesConfig(options: IResourcesConfigOptions): Array<Linter.Config> {
    const severity = options.severity ?? 'warn';
    const rules: Linter.RulesRecord = {
        [`${PLUGIN_NAMESPACE}/duplicate-keys`]: severity,
        [`${PLUGIN_NAMESPACE}/empty-values`]: severity,
        [`${PLUGIN_NAMESPACE}/key-consistency`]: severity
    };

    if (options.missingTranslations !== false) {
        rules[`${PLUGIN_NAMESPACE}/missing-translations`] = [severity, options.missingTranslations ?? {}];
    }

    if (options.unusedKeys) {
        rules[`${PLUGIN_NAMESPACE}/unused-keys`] = [severity, options.unusedKeys];
    }

    return [
        {
            name: 'wortlaut-resources',
            files: options.files,
            ...(options.ignores ? { ignores: options.ignores } : {}),
            plugins: {
                [PLUGIN_NAMESPACE]: plugin
            },
            rules
        }
    ];
}

/**
 * The configurations of this package.
 *
 * @public
 */
export const configs = {

    /**
     * Creates the configuration of the resource rules, see {@link createResourcesConfig}.
     */
    resources: createResourcesConfig
};
