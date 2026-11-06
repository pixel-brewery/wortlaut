// #region Imports

import { UnusedKeysRule, UsedKeysFinder, resourceTypeFormFile } from '@pixel-brewery/wortlaut-core';
import { FileSystem } from '@pixel-brewery/utilities';
import type { TSESLint } from '@typescript-eslint/utils';
import {
  createKeyLocator,
  createResourceFromContent,
  createResourceListener,
  hasAmbiguousKeys,
  reportTarget,
} from './Utils.js';

// #endregion

export const unusedKeysRule: TSESLint.RuleModule<'unusedKey'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detects unused translation keys in resource files.',
      url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules',
    },
    schema: [
      {
        type: 'object',
        properties: {
          usedKeys: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              'The keys that are used in the application: exact keys, globs such as `loc.orders.{open,closed}.label`, `loc.*.title` or `loc.api.error.*`, or regular expressions such as `/loc\\.step\\d+\\.title/`, with the syntax of Wortlaut `usedKeys` option.',
          },
          mode: {
            type: 'string',
            description: 'The mode of the resource files.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unusedKey: 'The translation key "{{ key }}" in locale "{{ locale }}" is unused.',
    },
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<'unusedKey', []>): TSESLint.RuleListener {
    interface Options {
      usedKeys?: Array<string>;
      mode?: string;
    }

    // Without options no key is used, so every key is reported.
    const options = ((context.options as Array<unknown>)[0] ?? {}) as Options;
    const usedKeys: Array<string> = options.usedKeys ?? [];
    const fileSystem = new FileSystem();
    const type = resourceTypeFormFile(context.filename);
    const resourceInfo = createResourceFromContent(
      context.sourceCode.text,
      type,
      fileSystem.fileGetLocale(context.filename),
    );

    return createResourceListener((node) => {
      if (hasAmbiguousKeys(resourceInfo)) {
        return;
      }

      const rule = new UnusedKeysRule();
      const result = rule.execute({
        resource: resourceInfo,
        parameters: {
          // The rule scans no sources, so the used keys are the keys that the entries match, with the
          // same syntax and matcher as the `usedKeys` of Wortlaut's `analyze` command.
          usedKeys: new UsedKeysFinder().find([], resourceInfo.keys(), { usedKeys: usedKeys }),
        },
      });

      const locate = createKeyLocator(context.sourceCode, type);

      result.data.forEach((data) => {
        data.unusedKeys.forEach((key) => {
          context.report({
            ...reportTarget(node, locate(key)),
            messageId: 'unusedKey',
            data: {
              key,
              locale: data.locale,
            },
          });
        });
      });
    });
  },
};
