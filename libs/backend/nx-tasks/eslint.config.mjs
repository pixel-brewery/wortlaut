// #region Imports

import { configs } from '@pixel-brewery/eslint-config';

// #endregion

/**
 * The configurations
 *
 * @public
 */
export default [
    ...configs.base,
    {
        languageOptions: {
            parserOptions: {
                project: 'tsconfig.eslint.json'
            }
        },
        files: ['**/*.ts'],
        rules: {
            // Override rules here...
        }
    }
];
