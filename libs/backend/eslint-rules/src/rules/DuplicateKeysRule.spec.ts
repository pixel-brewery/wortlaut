// #region Imports

import json from '@eslint/json';
import { RuleTester, type Linter, type Rule } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { describe, it } from 'vitest';
import { duplicateKeysRule } from './DuplicateKeysRule.js';

// #endregion

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The rule reads the raw resource text from `context.sourceCode.text` and reports on the root node. Resx and Po
 * resources are not JavaScript, so this parser only hands ESLint an empty `Program` that spans the resource text.
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
          end: { line: lines.length, column: lines[lines.length - 1].length },
        },
      },
      visitorKeys: { Program: [] },
    };
  },
};

function resx(entries: Array<[string, string]>): string {
  const data = entries
    .map(
      ([key, value]) =>
        `    <data name="${key}" xml:space="preserve">\n        <value>${value}</value>\n    </data>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>\n<root>\n${data}\n</root>\n`;
}

function po(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `msgid "${key}"\nmsgstr "${value}"\n`).join('\n');
}

const ruleTester = new RuleTester({
  languageOptions: {
    parser: resourceTextParser,
  },
});

/**
 * The shared configuration lints JSON with the `json/json` language of `@eslint/json`, whose root node is `Document`.
 */
const jsonRuleTester = new RuleTester({
  plugins: {
    json,
  },
  language: 'json/json',
});

describe('duplicateKeysRule', () => {
  ruleTester.run('duplicate-keys', duplicateKeysRule as unknown as Rule.RuleModule, {
    valid: [
      {
        name: 'json resource with unique keys',
        filename: 'translations.en.json',
        languageOptions: {
          parser: jsoncParser,
        },
        code: JSON.stringify(
          {
            greeting: 'Hello',
            farewell: 'Goodbye',
            nav: {
              label: 'Menu',
            },
          },
          null,
          4,
        ),
      },
      {
        name: 'resx resource with unique keys',
        filename: 'translations.de.resx',
        code: resx([
          ['greeting', 'Hallo'],
          ['farewell', 'Auf Wiedersehen'],
        ]),
      },
      {
        name: 'po resource with unique keys',
        filename: 'translations.fr.po',
        code: po([
          ['greeting', 'Bonjour'],
          ['farewell', 'Au revoir'],
        ]),
      },
    ],
    invalid: [
      {
        name: 'json resource parsed by jsonc-eslint-parser with a key spelled flat and nested',
        filename: 'translations.en.json',
        languageOptions: {
          parser: jsoncParser,
        },
        code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'nav.label',
              locale: 'en',
            },
            line: 4,
            column: 9,
            endLine: 4,
            endColumn: 16,
          },
        ],
      },
      {
        name: 'resx resource with a duplicate key, reported at the name of the repeating data element',
        filename: 'translations.de.resx',
        code: resx([
          ['greeting', 'Hallo'],
          ['farewell', 'Auf Wiedersehen'],
          ['greeting', 'Guten Tag'],
        ]),
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'greeting',
              locale: 'de',
            },
            line: 9,
            column: 17,
            endLine: 9,
            endColumn: 25,
          },
        ],
      },
      {
        name: 'po resource with a duplicate key, reported at the repeating msgid',
        filename: 'translations.fr.po',
        code: po([
          ['greeting', 'Bonjour'],
          ['greeting', 'Salut'],
          ['farewell', 'Au revoir'],
        ]),
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'greeting',
              locale: 'fr',
            },
            line: 4,
            column: 8,
            endLine: 4,
            endColumn: 16,
          },
        ],
      },
    ],
  });

  jsonRuleTester.run('duplicate-keys', duplicateKeysRule as unknown as Rule.RuleModule, {
    valid: [
      {
        name: 'json/json resource with unique flat and nested keys',
        filename: 'translations.en.json',
        code: '{\n    "greeting": "Hello",\n    "nav.title": "Navigation",\n    "nav": {\n        "label": "Menu"\n    }\n}\n',
      },
      {
        name: 'json/json resource whose key text contains escaped quotes and dots',
        filename: 'translations.en.json',
        code: '{\n    "say \\"hi\\"": "Hi",\n    "say": {\n        "\\"hi\\"": "Hello"\n    }\n}\n',
      },
    ],
    invalid: [
      {
        name: 'json/json resource that repeats a key in one object',
        filename: 'translations.en.json',
        code: '{\n    "greeting": "Hello",\n    "farewell": "Goodbye",\n    "greeting": "Hi"\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'greeting',
              locale: 'en',
            },
            line: 4,
            column: 5,
            endLine: 4,
            endColumn: 15,
          },
        ],
      },
      {
        name: 'json/json resource that repeats a key in a nested object, reported by its flattened key',
        filename: 'translations.de.json',
        code: '{\n    "nav": {\n        "label": "Menü",\n        "label": "Navigation"\n    }\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'nav.label',
              locale: 'de',
            },
          },
        ],
      },
      {
        name: 'json/json resource with a key spelled flat before nested',
        filename: 'translations.en.json',
        code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'nav.label',
              locale: 'en',
            },
          },
        ],
      },
      {
        name: 'json/json resource with a key spelled nested before flat',
        filename: 'translations.en.json',
        code: '{\n    "nav": {\n        "label": "Navigation"\n    },\n    "nav.label": "Menu"\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'nav.label',
              locale: 'en',
            },
          },
        ],
      },
      {
        name: 'json/json resource that spells a key three times, reported once at every repetition',
        filename: 'translations.en.json',
        code: '{\n    "greeting": "Hello",\n    "greeting": "Hi",\n    "farewell": "Goodbye",\n    "greeting": "Hey"\n}\n',
        errors: [
          {
            messageId: 'duplicateKey',
            data: {
              key: 'greeting',
              locale: 'en',
            },
            line: 3,
            column: 5,
          },
          {
            messageId: 'duplicateKey',
            data: {
              key: 'greeting',
              locale: 'en',
            },
            line: 5,
            column: 5,
          },
        ],
      },
    ],
  });
});
