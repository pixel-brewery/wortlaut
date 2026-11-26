// #region Imports

import { configs } from '@pixel-brewery/eslint-config';
import globals from 'globals';

// #endregion

/**
 * Applies Wortlaut's shared source rules to the private repository tooling.
 *
 * @internal
 */
export default [
    ...configs.base,
    {
        files: ['**/*.{mjs,ts}'],
        languageOptions: { globals: globals.node }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: { project: './tsconfig.eslint.json',
                tsconfigRootDir: import.meta.dirname }
        }
    }
];
