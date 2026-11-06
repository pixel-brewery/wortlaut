// #region Imports

import json from '@eslint/json';
import { RuleTester, type Rule } from 'eslint';
import { describe, it } from 'vitest';
import { unusedKeysRule } from './UnusedKeysRule.js';

// #endregion

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The shared configuration lints JSON with the `json/json` language of `@eslint/json`, whose root node is `Document`.
 */
const jsonRuleTester = new RuleTester({
  plugins: {
    json,
  },
  language: 'json/json',
});

describe('unusedKeysRule', () => {
  jsonRuleTester.run('resource-unused-keys', unusedKeysRule as unknown as Rule.RuleModule, {
    valid: [
      {
        name: 'json/json resource whose keys all match the used keys',
        filename: 'translations.en.json',
        options: [
          {
            usedKeys: ['greeting', 'nav.*'],
          },
        ],
        code: JSON.stringify(
          {
            greeting: 'Hello',
            nav: {
              label: 'Menu',
              title: 'Navigation',
            },
          },
          null,
          4,
        ),
      },
      {
        name: 'json/json resource with a key spelled flat and nested is left to duplicate-keys instead of failing',
        filename: 'translations.en.json',
        options: [
          {
            usedKeys: [],
          },
        ],
        code: '{\n    "nav.label": "Menu",\n    "nav": {\n        "label": "Navigation"\n    }\n}\n',
      },
    ],
    invalid: [
      {
        name: 'json/json resource linted without options, whose keys are all unused',
        filename: 'translations.en.json',
        code: JSON.stringify(
          {
            greeting: 'Hello',
          },
          null,
          4,
        ),
        errors: [
          {
            messageId: 'unusedKey',
            data: {
              key: 'greeting',
              locale: 'en',
            },
            line: 2,
            column: 5,
          },
        ],
      },
      {
        name: 'json/json resource with flat and nested keys that match no used key, reported at each key',
        filename: 'translations.de.json',
        options: [
          {
            usedKeys: ['greeting'],
          },
        ],
        code: JSON.stringify(
          {
            nav: {
              label: 'Menü',
            },
            greeting: 'Hallo',
            farewell: 'Auf Wiedersehen',
          },
          null,
          4,
        ),
        errors: [
          {
            messageId: 'unusedKey',
            data: {
              key: 'nav.label',
              locale: 'de',
            },
            line: 3,
            column: 9,
          },
          {
            messageId: 'unusedKey',
            data: {
              key: 'farewell',
              locale: 'de',
            },
            line: 6,
            column: 5,
          },
        ],
      },
    ],
  });
});
