// #region Imports

import type { IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS } from '../CliArgs';
import { DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG } from './configurations/IAnalyzeCommandArgsConfig';

// #endregion

/**
 * Splits a comma-separated list of key patterns at the commas outside braces, so that the alternatives of a pattern such
 * as `loc.orders.{open,closed}.label` stay in one pattern. `\` escapes the next character.
 *
 * @internal
 * @param value The comma-separated list.
 * @returns The trimmed, non-empty patterns.
 */
function splitKeyPatterns(value: string): Array<string> {
    const patterns = new Array<string>();
    let depth = 0;
    let start = 0;

    for (let index = 0; index < value.length; index++) {
        const character = value[index];

        if (character === '\\') {
            index++;
        } else if (character === '{') {
            depth++;
        } else if (character === '}') {
            depth = Math.max(0, depth - 1);
        } else if (character === ',' && depth === 0) {
            patterns.push(value.slice(start, index));
            start = index + 1;
        }
    }

    patterns.push(value.slice(start));

    return patterns
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern.length > 0);
}

// #region Arguments

/**
 * Argument to specify the type of the resource.
 *
 * @internal
 */
export const TYPE_ARG: IProgramArg = {
    alias: ['-t', '--type'], // Changed to kebab-case for long alias
    options: {
        required: true,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.type,
        metavar: 'string',
        help: 'The type of the resource.',
        choices: ['json', 'resx', 'po'] // Limited to supported resource types
    }
};

/**
 * Argument to specify the rules to analyze resources.
 *
 * @internal
 */
export const RULES_ARG: IProgramArg = {
    alias: ['-u', '--rules'], // Changed short alias to a single character
    options: {
        type: (value: string) => value.split(',').map((rule) => rule.trim())
            .filter((rule) => rule.length > 0),
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.rules,
        metavar: 'string',
        help: 'The rules to analyze the resources. If empty, all rules will be applied.'
    }
};

/**
 * Argument to specify the resource root directory.
 *
 * @internal
 */
export const RESOURCE_ROOT_ARG: IProgramArg = {
    alias: ['-R', '--resource-root'], // Short alias set to -R, long alias changed to kebab-case
    options: {
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.resourceRoot,
        metavar: 'string',
        help: 'The resource root directory.'
    }
};

/**
 * Argument to specify the root directory for locating resources.
 *
 * @internal
 */
export const ROOT_ARG: IProgramArg = {
    alias: ['-r', '--root'], // Long alias changed to kebab-case
    options: {
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.root,
        metavar: 'string',
        help: 'The root directory to locate the used resources.'
    }
};

/**
 * Argument to specify the preset for analyzing resources.
 *
 * @internal
 */
export const PRESET_ARG: IProgramArg = {
    alias: ['-p', '--preset'], // Long alias changed to kebab-case
    options: {
        required: false,
        metavar: 'string',
        help: 'The preset to analyze the resources.',
        choices: ['angular', 'react', 'vue', 'lit', 'stencil'] // Defined supported frameworks
    }
};

/**
 * Argument to specify the prefix for resource keys.
 *
 * @internal
 */
export const RESOURCE_KEY_PREFIX_ARG: IProgramArg = {
    alias: ['-P', '--resource-key-prefix'], // Changed long alias to kebab-case, short alias to -P
    options: {
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.resourceKeyPrefix,
        metavar: 'string',
        help: 'The prefix of the resource key.'
    }
};

/**
 * Argument to specify the suffix for resource keys.
 *
 * @internal
 */
export const RESOURCE_KEY_SUFFIX_ARG: IProgramArg = {
    alias: ['-S', '--resource-key-suffix'], // Changed long alias to kebab-case, short alias to -S
    options: {
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.resourceKeySuffix,
        metavar: 'string',
        help: 'The suffix of the resource key.'
    }
};

/**
 * Argument to specify keys that count as used although no source mentions them.
 *
 * @internal
 */
export const USED_KEYS_ARG: IProgramArg = {
    alias: ['-U', '--used-keys'],
    options: {
        type: splitKeyPatterns,
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.usedKeys,
        metavar: 'Array',
        help: 'A comma-separated list of keys that count as used although no source mentions them, for example keys another library composes. An entry is an exact key, a glob or a /regular expression/: `*` matches within one segment and, at the end, the rest of the key, `**` any number of segments, `?` one character and `{a,b}` either alternative. Commas inside braces do not separate entries, e.g. loc.api.error.*,loc.orders.{open,closed}.label'
    }
};

/**
 * Argument to specify the base locale that the `missing-translations` rule compares the other locales with.
 *
 * @internal
 */
export const BASE_LOCALE_ARG: IProgramArg = {
    alias: ['-bl', '--base-locale'],
    options: {
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.baseLocale,
        metavar: 'string',
        help: 'The base locale that the missing-translations rule compares the values of the other locales with, e.g. en'
    }
};

/**
 * Argument to specify keys whose value may be identical to the base locale's value.
 *
 * @internal
 */
export const IDENTICAL_KEYS_ARG: IProgramArg = {
    alias: ['-ik', '--identical-keys'],
    options: {
        type: (value: string) => value.split(',')
            .map((pattern) => pattern.trim())
            .filter((pattern) => pattern.length > 0),
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.identicalKeys,
        metavar: 'Array',
        help: 'A comma-separated list of key patterns whose value may be identical to the base locale\'s value. `*` matches any characters, e.g. loc.integrations.*.name'
    }
};

/**
 * Argument to specify values that need no translation.
 *
 * @internal
 */
export const IDENTICAL_VALUES_ARG: IProgramArg = {
    alias: ['-iv', '--identical-values'],
    options: {
        type: (value: string) => value.split(',')
            .map((identicalValue) => identicalValue.trim())
            .filter((identicalValue) => identicalValue.length > 0),
        required: false,
        default: DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG.identicalValues,
        metavar: 'Array',
        help: 'A comma-separated list of values that need no translation, such as brand names or units, e.g. PDF,DATEV'
    }
};

// #endregion

// #region Exports

/**
 * Aggregate export for all analyze command arguments.
 *
 * @internal
 */
export const ANALYZE_COMMAND_ARGS = [
    ...CLI_ARGS,
    TYPE_ARG,
    RULES_ARG,
    RESOURCE_ROOT_ARG,
    ROOT_ARG,
    PRESET_ARG,
    RESOURCE_KEY_PREFIX_ARG,
    RESOURCE_KEY_SUFFIX_ARG,
    USED_KEYS_ARG,
    BASE_LOCALE_ARG,
    IDENTICAL_KEYS_ARG,
    IDENTICAL_VALUES_ARG
];

// #endregion
