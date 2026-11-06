// #region Imports

import { MultipleKeyUsageRule, resourceTypeFormFile } from '@pixel-brewery/wortlaut-core';
import { FileSystem } from '@pixel-brewery/utilities';
import { createResourceFromContent, createResourceListener, hasAmbiguousKeys } from './Utils.js';
import type { TSESLint } from '@typescript-eslint/utils';

// #endregion

export const multipleKeyUsageRule: TSESLint.RuleModule<'multipleKeyUsage'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detects incorrect multiple usage of translation keys.',

      url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules',
    },
    schema: [],
    messages: {
      multipleKeyUsage: 'The translation key "{{ key }}" is used inconsistently across contexts.',
    },
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<'multipleKeyUsage', []>): TSESLint.RuleListener {
    const fileSystem = new FileSystem();
    const resourceInfo = createResourceFromContent(
      context.sourceCode.text,
      resourceTypeFormFile(context.filename),
      fileSystem.fileGetLocale(context.filename),
    );

    return createResourceListener((node) => {
      if (hasAmbiguousKeys(resourceInfo)) {
        return;
      }

      const rule = new MultipleKeyUsageRule();
      const result = rule.execute({
        resource: resourceInfo,
        parameters: {},
      });

      result.data.forEach((data) => {
        data.multipleUsageKeys.forEach((key) => {
          context.report({
            node,
            messageId: 'multipleKeyUsage',
            data: {
              key,
            },
          });
        });
      });
    });
  },
};
