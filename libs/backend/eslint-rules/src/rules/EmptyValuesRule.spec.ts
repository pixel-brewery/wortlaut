// #region Imports

import json from '@eslint/json';
import { RuleTester, type Rule } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { describe, it } from 'vitest';
import { emptyValuesRule } from './EmptyValuesRule.js';

// #endregion

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The rule reads the raw resource text from `context.sourceCode.text` and reports on the root node. `jsonc-eslint-parser`
 * validates the JSON and produces a `Program` root.
 */
const ruleTester = new RuleTester({
    languageOptions: {
        parser: jsoncParser
    }
});

/**
 * The shared configuration lints JSON with the `json/json` language of `@eslint/json`, whose root node is `Document`.
 */
const jsonRuleTester = new RuleTester({
    plugins: {
        json
    },
    language: 'json/json'
});

describe('emptyValuesRule', () => {
    ruleTester.run('empty-values', emptyValuesRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'json resource without empty values',
                filename: 'translations.en.json',
                code: JSON.stringify({
                    greeting: 'Hello',
                    farewell: 'Goodbye',
                    nav: {
                        label: 'Menu'
                    }
                }, null, 4)
            }
        ],
        invalid: [
            {
                name: 'json resource with one empty value',
                filename: 'translations.en.json',
                code: JSON.stringify({
                    greeting: '',
                    farewell: 'Goodbye'
                }, null, 4),
                errors: [
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'greeting',
                            locale: 'en'
                        }
                    }
                ]
            },
            {
                name: 'json resource with several empty values in document order',
                filename: 'translations.de.json',
                code: JSON.stringify({
                    welcome: '',
                    farewell: '',
                    greeting: 'Hallo'
                }, null, 4),
                errors: [
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'welcome',
                            locale: 'de'
                        }
                    },
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'farewell',
                            locale: 'de'
                        }
                    }
                ]
            },
            {
                name: 'json resource with an empty nested value reported by its flattened key',
                filename: 'translations.en.json',
                code: JSON.stringify({
                    greeting: 'Hello',
                    nav: {
                        label: ''
                    }
                }, null, 4),
                errors: [
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'nav.label',
                            locale: 'en'
                        }
                    }
                ]
            }
        ]
    });

    jsonRuleTester.run('empty-values', emptyValuesRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'json/json resource without empty values',
                filename: 'translations.en.json',
                code: JSON.stringify({
                    greeting: 'Hello',
                    nav: {
                        label: 'Menu'
                    }
                }, null, 4)
            },
            {
                name: 'json/json resource with a key spelled flat and nested is left to duplicate-keys instead of failing',
                filename: 'translations.en.json',
                code: '{\n    "nav.label": "",\n    "nav": {\n        "label": "Menu"\n    }\n}\n'
            }
        ],
        invalid: [
            {
                name: 'json/json resource with one empty value',
                filename: 'translations.en.json',
                code: JSON.stringify({
                    greeting: '',
                    farewell: 'Goodbye'
                }, null, 4),
                errors: [
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'greeting',
                            locale: 'en'
                        },
                        line: 2,
                        column: 5,
                        endLine: 2,
                        endColumn: 15
                    }
                ]
            },
            {
                name: 'json/json resource with empty nested and null values in document order',
                filename: 'translations.de.json',
                code: JSON.stringify({
                    greeting: 'Hallo',
                    nav: {
                        label: ''
                    },
                    farewell: null
                }, null, 4),
                errors: [
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'nav.label',
                            locale: 'de'
                        }
                    },
                    {
                        messageId: 'emptyValue',
                        data: {
                            key: 'farewell',
                            locale: 'de'
                        }
                    }
                ]
            }
        ]
    });
});
