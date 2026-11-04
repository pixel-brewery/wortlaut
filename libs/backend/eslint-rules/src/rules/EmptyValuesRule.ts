// #region Imports

import { EmptyValuesRule, resourceTypeFormFile } from '@pixel-brewery/wortlaut-core';
import { FileSystem } from '@pixel-brewery/utilities';
import type { TSESLint } from '@typescript-eslint/utils';
import { createKeyLocator, createResourceFromContent, createResourceListener, hasAmbiguousKeys, reportTarget } from './Utils.js';

// #endregion

export const emptyValuesRule: TSESLint.RuleModule<'emptyValue'> = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Detects translation keys with empty values in resource files.',
            url: 'https://github.com/pixel-brewery/wortlaut/tree/main/libs/backend/eslint-rules#rules'
        },
        schema: [],
        messages: {
            emptyValue: 'The translation key "{{ key }}" has an empty value in locale "{{ locale }}".'
        }
    },
    defaultOptions: [],
    create(context: TSESLint.RuleContext<'emptyValue', []>): TSESLint.RuleListener {
        const fileSystem = new FileSystem();
        const type = resourceTypeFormFile(context.filename);
        const resourceInfo = createResourceFromContent(context.sourceCode.text, type, fileSystem.fileGetLocale(context.filename));

        return createResourceListener((node) => {
            if (hasAmbiguousKeys(resourceInfo)) {
                return;
            }

            const rule = new EmptyValuesRule();
            const result = rule.execute({
                resource: resourceInfo,
                parameters: {}
            });
            const locate = createKeyLocator(context.sourceCode, type);

            result.data.forEach((data) => {
                data.keys.forEach((key) => {
                    context.report({
                        ...reportTarget(node, locate(key)),
                        messageId: 'emptyValue',
                        data: {
                            key,
                            locale: data.locale
                        }
                    });
                });
            });
        });
    }
};
