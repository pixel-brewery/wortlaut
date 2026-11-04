// #region Imports

import json from '@eslint/json';
import { RuleTester, type Rule } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it } from 'vitest';
import { missingTranslationsRule } from './MissingTranslationsRule.js';

// #endregion

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The rule reads the base locale from the sibling file on disk, so the base locales of the cases are written to a
 * temporary directory and the linted resources are named after siblings in it.
 */
const directory = mkdtempSync(join(tmpdir(), 'missing-translations-rule-'));

writeFileSync(join(directory, 'translations.en.json'), JSON.stringify({
    greeting: 'Hello',
    farewell: 'Goodbye',
    brand: 'Mosaik',
    nav: {
        label: 'Menu'
    }
}, null, 4));
writeFileSync(join(directory, 'ambiguous.en.json'), '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n');

/**
 * The shared configuration lints JSON with the `json/json` language of `@eslint/json`, whose root node is `Document`.
 */
const jsonRuleTester = new RuleTester({
    plugins: {
        json
    },
    language: 'json/json'
});

const ruleTester = new RuleTester({
    languageOptions: {
        parser: jsoncParser
    }
});

describe('missingTranslationsRule', () => {
    afterAll(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    ruleTester.run('resource-missing-translations', missingTranslationsRule as unknown as Rule.RuleModule, {
        valid: [],
        invalid: [
            {
                name: 'json resource parsed by jsonc-eslint-parser with a value identical to the base locale',
                filename: join(directory, 'translations.de.json'),
                code: JSON.stringify({
                    greeting: 'Hello',
                    farewell: 'Auf Wiedersehen'
                }, null, 4),
                errors: [
                    {
                        messageId: 'missingTranslation',
                        data: {
                            key: 'greeting',
                            locale: 'de',
                            baseLocale: 'en'
                        }
                    }
                ]
            }
        ]
    });

    jsonRuleTester.run('resource-missing-translations', missingTranslationsRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'json/json resource whose values are translated',
                filename: join(directory, 'translations.de.json'),
                code: JSON.stringify({
                    greeting: 'Hallo',
                    nav: {
                        label: 'Menü'
                    }
                }, null, 4)
            },
            {
                name: 'json/json resource in the base locale',
                filename: join(directory, 'translations.en.json'),
                code: JSON.stringify({
                    greeting: 'Hello'
                }, null, 4)
            },
            {
                name: 'json/json resource whose identical value is declared as needing no translation',
                filename: join(directory, 'translations.de.json'),
                options: [
                    {
                        identicalValues: ['Mosaik']
                    }
                ],
                code: JSON.stringify({
                    brand: 'Mosaik'
                }, null, 4)
            },
            {
                name: 'json/json resource with a key spelled flat and nested is left to duplicate-keys instead of failing',
                filename: join(directory, 'translations.fr.json'),
                code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n'
            },
            {
                name: 'json/json resource whose base locale spells a key flat and nested is left to duplicate-keys instead of failing',
                filename: join(directory, 'ambiguous.de.json'),
                code: JSON.stringify({
                    nav: {
                        label: 'Menu'
                    }
                }, null, 4)
            }
        ],
        invalid: [
            {
                name: 'json/json resource with flat and nested values identical to the base locale, reported at each key',
                filename: join(directory, 'translations.de.json'),
                code: JSON.stringify({
                    nav: {
                        label: 'Menu'
                    },
                    greeting: 'Hello',
                    farewell: 'Auf Wiedersehen'
                }, null, 4),
                errors: [
                    {
                        messageId: 'missingTranslation',
                        data: {
                            key: 'nav.label',
                            locale: 'de',
                            baseLocale: 'en'
                        },
                        line: 3,
                        column: 9,
                        endLine: 3,
                        endColumn: 16
                    },
                    {
                        messageId: 'missingTranslation',
                        data: {
                            key: 'greeting',
                            locale: 'de',
                            baseLocale: 'en'
                        },
                        line: 5,
                        column: 5,
                        endLine: 5,
                        endColumn: 15
                    }
                ]
            }
        ]
    });
});
