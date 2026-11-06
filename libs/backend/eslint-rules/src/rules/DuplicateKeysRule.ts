// #region Imports

import {
  DuplicateKeysRule,
  ResourceType,
  resourceTypeFormFile,
} from '@pixel-brewery/wortlaut-core';
import { FileSystem } from '@pixel-brewery/utilities';
import type { TSESLint } from '@typescript-eslint/utils';
import {
  createKeyLocator,
  createResourceFromContent,
  createResourceListener,
  readJsonKeys,
  reportTarget,
} from './Utils.js';

// #endregion

export const duplicateKeysRule: TSESLint.RuleModule<'duplicateKey'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detects duplicate translation keys in resource files.',
      url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules',
    },
    schema: [],
    messages: {
      duplicateKey: 'The translation key "{{ key }}" is duplicated in locale "{{ locale }}".',
    },
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<'duplicateKey', []>): TSESLint.RuleListener {
    const fileSystem = new FileSystem();
    const type = resourceTypeFormFile(context.filename);
    const locale = fileSystem.fileGetLocale(context.filename);

    return createResourceListener((node) => {
      // A parsed JSON object keeps only the last value of a repeated key, and `JsonResourceInfo` rejects a key
      // that is spelled flat and nested, so the keys of a JSON resource are read from its raw text.
      const duplicates =
        type === ResourceType.Json
          ? findDuplicates(readJsonKeys(context.sourceCode.text))
          : new DuplicateKeysRule()
              .execute({
                resource: createResourceFromContent(context.sourceCode.text, type, locale),
                parameters: {},
              })
              .data.flatMap((data) => data.duplicates);
      const locate = createKeyLocator(context.sourceCode, type);
      const repetitions = new Map<string, number>();

      // Every repetition is reported at its own spelling: the first spelling defines the key, the next ones repeat it.
      duplicates.forEach((key) => {
        const occurrence = (repetitions.get(key) ?? 0) + 1;

        repetitions.set(key, occurrence);
        context.report({
          ...reportTarget(node, locate(key, occurrence)),
          messageId: 'duplicateKey',
          data: {
            key,
            locale,
          },
        });
      });
    });
  },
};

/**
 * Finds the keys that occur more than once, sorted like the keys of a resource, with one entry for every repetition,
 * like the `DuplicateKeysRule` of Wortlaut.
 *
 * @param keys The keys.
 * @returns The duplicate keys.
 */
function findDuplicates(keys: Array<string>): Array<string> {
  return keys
    .sort((a, b) => a.localeCompare(b))
    .filter((key, index, sorted) => sorted.indexOf(key) !== index);
}
