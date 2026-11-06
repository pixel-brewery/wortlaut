// #region Imports

import { baseConfig } from '../../../tools/linting/base.eslint.config.mjs';

// #endregion

/**
 * The configurations
 *
 * @public
 */
export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.eslint.json',
      },
    },
    files: ['**/*.ts'],
    rules: {
      // Override rules here...
    },
  },
];
