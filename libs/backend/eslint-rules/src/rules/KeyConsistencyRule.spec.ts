// #region Imports

import json from '@eslint/json';
import { KeyConsistencyRule } from '@pixel-brewery/wortlaut-core';
import { Linter, RuleTester, type Rule } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { keyConsistencyRule } from './KeyConsistencyRule.js';

// #endregion

/**
 * The rule reads the other locales of a catalog from the sibling files on disk, so the other locales of the cases are
 * written to a temporary directory and the linted resources are named after siblings in it.
 */
const directory = mkdtempSync(join(tmpdir(), 'key-consistency-rule-'));

writeFileSync(join(directory, 'lang.en.json'), JSON.stringify({
    greeting: 'Hello',
    farewell: 'Goodbye',
    nav: {
        label: 'Menu'
    }
}, null, 4));
writeFileSync(join(directory, 'lang.nl.json'), JSON.stringify({
    greeting: 'Hallo',
    extra: 'Extra'
}, null, 4));
// Another catalog in the same directory, which is not compared.
writeFileSync(join(directory, 'other.en.json'), JSON.stringify({
    unrelated: 'Unrelated'
}, null, 4));
writeFileSync(join(directory, 'ambiguous.en.json'), '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n');

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

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
                        'resource-key-consistency': keyConsistencyRule as unknown as Rule.RuleModule
                    }
                }
            },
            language: 'json/json',
            rules: {
                'mosaik/resource-key-consistency': 'error'
            }
        }
    ], filename);
}

describe('keyConsistencyRule', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('analyzes a json/json resource once on its Document root', () => {
        // Arrange
        const execute = vi.spyOn(KeyConsistencyRule.prototype, 'execute');

        // Act
        const messages = lintJson(JSON.stringify({ greeting: 'Hello', nav: { label: 'Menu' } }, null, 4), 'translations.en.json');

        // Assert
        expect(messages).toEqual([]);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0][0].resource.keys()).toEqual(['greeting', 'nav.label']);
    });

    jsonRuleTester.run('resource-key-consistency', keyConsistencyRule as unknown as Rule.RuleModule, {
        valid: [
            {
                name: 'json/json resource, which is compared with no other locale',
                filename: 'translations.de.json',
                code: JSON.stringify({
                    greeting: 'Hallo'
                }, null, 4)
            },
            {
                name: 'json/json resource with a key spelled flat and nested is left to duplicate-keys instead of failing',
                filename: 'translations.en.json',
                code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n'
            },
            {
                name: 'json/json resource that defines every key of the other locales of its catalog',
                filename: join(directory, 'lang.de.json'),
                code: JSON.stringify({
                    greeting: 'Hallo',
                    farewell: 'Auf Wiedersehen',
                    extra: 'Extra',
                    nav: {
                        label: 'Menü'
                    }
                }, null, 4)
            },
            {
                name: 'json/json resource whose sibling locale has a key spelled flat and nested is skipped instead of failing',
                filename: join(directory, 'ambiguous.de.json'),
                code: JSON.stringify({
                    greeting: 'Hallo'
                }, null, 4)
            }
        ],
        invalid: [
            {
                name: 'json/json resource that lacks keys of the other locales of its catalog on disk',
                filename: join(directory, 'lang.de.json'),
                code: JSON.stringify({
                    greeting: 'Hallo'
                }, null, 4),
                errors: ['extra', 'farewell', 'nav.label'].map((key) => ({
                    messageId: 'inconsistentKey' as const,
                    data: {
                        key,
                        locale: 'de',
                        comparedLocales: 'en, nl'
                    },
                    line: 1,
                    column: 1
                }))
            }
        ]
    });
});
