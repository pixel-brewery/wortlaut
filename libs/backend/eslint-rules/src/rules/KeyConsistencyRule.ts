// #region Imports

import { KeyConsistencyRule, resourceTypeFormFile } from '@pixel-brewery/wortlaut-core';
import { FileSystem } from '@pixel-brewery/utilities';
import type { TSESLint } from '@typescript-eslint/utils';
import {
  createResourceFromContent,
  createResourceListener,
  hasAmbiguousKeys,
  readCatalogResources,
} from './Utils.js';

// #endregion

/**
 * Reports the keys that another locale of the catalog of a resource file defines and the resource lacks.
 *
 * @remarks
 * The other locales are the sibling files of the catalog on disk (see `readCatalogResources`). A missing key has no
 * spelling in the resource, so it is reported on the root of the file.
 *
 * @public
 */
export const keyConsistencyRule: TSESLint.RuleModule<'inconsistentKey'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensures that translation keys are consistent across locales.',
      url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules',
    },
    schema: [],
    messages: {
      inconsistentKey:
        'The translation key "{{ key }}" is inconsistent across locales: locale "{{ locale }}" lacks it, other locales of its catalog ({{ comparedLocales }}) define it.',
    },
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<'inconsistentKey', []>): TSESLint.RuleListener {
    const fileSystem = new FileSystem();
    const type = resourceTypeFormFile(context.filename);
    const locale = fileSystem.fileGetLocale(context.filename);
    const resourceInfo = createResourceFromContent(
      context.sourceCode.text,
      type,
      locale,
      context.filename,
    );

    return createResourceListener((node) => {
      const otherLocales = readCatalogResources(context.filename, type, locale);

      // A resource whose keys cannot be read is left to duplicate-keys instead of failing the lint run.
      if (
        hasAmbiguousKeys(resourceInfo) ||
        otherLocales.some((resource) => hasAmbiguousKeys(resource))
      ) {
        return;
      }

      const rule = new KeyConsistencyRule();
      const result = rule.execute({
        resource: resourceInfo,
        resources: [resourceInfo, ...otherLocales],
        parameters: {},
      });

      result.data.forEach((data) => {
        data.missingKeys.forEach((key) => {
          context.report({
            node,
            messageId: 'inconsistentKey',
            data: {
              key,
              locale: data.locale,
              comparedLocales: data.comparedLocales.join(', '),
            },
          });
        });
      });
    });
  },
};
