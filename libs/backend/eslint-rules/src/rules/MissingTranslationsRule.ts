// #region Imports

import {
  type IMissingTranslationsRuleParameters,
  type IResourceInfo,
  MissingTranslationsRule,
  resourceTypeFormFile,
} from '@pixel-brewery/wortlaut-core';
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

export const missingTranslationsRule: TSESLint.RuleModule<'missingTranslation'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Detects untranslated values: values that are identical to the value of the base locale.',
      url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseLocale: {
            type: 'string',
            description: 'The locale the other locales are translated from. Defaults to `en`.',
          },
          identicalKeys: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              "Patterns of keys whose value may be identical to the base locale's value; `*` matches any characters.",
          },
          identicalValues: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Values that need no translation, such as brand names or units.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTranslation:
        'The value of the translation key "{{ key }}" in locale "{{ locale }}" is identical to the base locale "{{ baseLocale }}".',
    },
  },
  defaultOptions: [],
  create(context: TSESLint.RuleContext<'missingTranslation', []>): TSESLint.RuleListener {
    const options = ((context.options as Array<unknown>)[0] ??
      {}) as IMissingTranslationsRuleParameters;
    const baseLocale = options.baseLocale ?? 'en';
    const fileSystem = new FileSystem();
    const locale = fileSystem.fileGetLocale(context.filename);
    const type = resourceTypeFormFile(context.filename);
    const resourceInfo = createResourceFromContent(
      context.sourceCode.text,
      type,
      locale,
      context.filename,
    );
    const resources: Array<IResourceInfo> = [resourceInfo];
    const fileName = fileSystem.pathGetFileName(context.filename);
    const localeIndex = fileName.lastIndexOf(`.${locale}.`);

    // The base locale is the sibling file whose name has the base locale in place of the locale.
    if (locale !== baseLocale && localeIndex >= 0) {
      const directory = context.filename.slice(0, context.filename.length - fileName.length);
      const baseFile = `${directory}${fileName.slice(0, localeIndex)}.${baseLocale}.${fileName.slice(localeIndex + locale.length + 2)}`;

      if (fileSystem.fileExists(baseFile)) {
        resources.push(
          createResourceFromContent(
            fileSystem.fileReadAllText(baseFile),
            type,
            baseLocale,
            baseFile,
          ),
        );
      }
    }

    return createResourceListener((node) => {
      if (resources.some((resource) => hasAmbiguousKeys(resource))) {
        return;
      }

      const rule = new MissingTranslationsRule();
      const result = rule.execute({
        resource: resourceInfo,
        resources: resources,
        parameters: {
          ...options,
          baseLocale,
        },
      });
      const locate = createKeyLocator(context.sourceCode, type);

      result.data.forEach((data) => {
        data.untranslatedKeys.forEach((key) => {
          context.report({
            ...reportTarget(node, locate(key)),
            messageId: 'missingTranslation',
            data: {
              key,
              locale: data.locale,
              baseLocale: data.baseLocale,
            },
          });
        });
      });
    });
  },
};
