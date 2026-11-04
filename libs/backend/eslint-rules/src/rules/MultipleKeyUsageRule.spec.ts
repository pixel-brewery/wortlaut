// #region Imports

import json from '@eslint/json';
import { MultipleKeyUsageRule } from '@pixel-brewery/wortlaut-core';
import { Linter, RuleTester, type Rule } from 'eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { multipleKeyUsageRule } from './MultipleKeyUsageRule.js';

// #endregion

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The rule reads the raw resource text from `context.sourceCode.text` and reports on the root node. Po resources are
 * not JavaScript, so this parser only hands ESLint an empty `Program` that spans the resource text.
 */
const resourceTextParser: Linter.Parser = {
    parseForESLint(text: string) {
        const lines = text.split('\n');

        return {
            ast: {
                type: 'Program',
                sourceType: 'module',
                body: [],
                tokens: [],
                comments: [],
                range: [0, text.length],
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: lines[lines.length - 1].length }
                }
            },
            visitorKeys: { Program: [] }
        };
    }
};

function po(entries: Array<[string, string]>): string {
    return entries
        .map(([key, value]) => `msgid "${key}"\nmsgstr "${value}"\n`)
        .join('\n');
}

const ruleTester = new RuleTester({
    languageOptions: {
        parser: resourceTextParser
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

function lintJson(code: string, filename: string): Array<Linter.LintMessage> {
    return new Linter({ configType: 'flat' }).verify(code, [
        {
            files: ['**/*.json'],
            plugins: {
                json,
                mosaik: {
                    rules: {
                        'resource-multiple-key-usage': multipleKeyUsageRule as unknown as Rule.RuleModule
                    }
                }
            },
            language: 'json/json',
            rules: {
                'mosaik/resource-multiple-key-usage': 'error'
            }
        }
    ], filename);
}

describe('multipleKeyUsageRule', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('analyzes a json/json resource once on its Document root', () => {
        // Arrange
        const execute = vi.spyOn(MultipleKeyUsageRule.prototype, 'execute');

        // Act
        const messages = lintJson(JSON.stringify({ greeting: 'Hello', nav: { label: 'Menu' } }, null, 4), 'translations.en.json');

        // Assert
        expect(messages).toEqual([]);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0][0].resource.keys()).toEqual(['greeting', 'nav.label']);
    });

    ruleTester.run('resource-multiple-key-usage', multipleKeyUsageRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'po resource with unique keys',
                filename: 'translations.fr.po',
                code: po([
                    ['greeting', 'Bonjour'],
                    ['farewell', 'Au revoir']
                ])
            }
        ],
        invalid: [
            {
                name: 'po resource that uses a key twice',
                filename: 'translations.fr.po',
                code: po([
                    ['greeting', 'Bonjour'],
                    ['farewell', 'Au revoir'],
                    ['greeting', 'Salut']
                ]),
                errors: [
                    {
                        messageId: 'multipleKeyUsage',
                        data: {
                            key: 'greeting'
                        }
                    }
                ]
            }
        ]
    });

    jsonRuleTester.run('resource-multiple-key-usage', multipleKeyUsageRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'json/json resource with unique keys',
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
                code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n'
            }
        ],
        invalid: []
    });
});
