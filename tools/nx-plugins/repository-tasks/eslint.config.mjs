// #region Imports

import globals from 'globals';
import { baseConfig } from '../../linting/base.eslint.config.mjs';

// #endregion

/**
 * Applies Wortlaut's shared source rules to the private repository tooling.
 *
 * @internal
 */
export default [
  ...baseConfig,
  {
    files: ['**/*.{mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname },
    },
  },
];
