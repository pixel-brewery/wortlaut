// #region Imports

import { configs } from '@pixel-brewery/eslint-config';

// #endregion

/**
 * The lint rules of every frontend project. Each project keeps its own `tsconfig.eslint.json`.
 *
 * @returns The configurations.
 */
export function frontendConfig() {
    return [
        ...configs.base,
        {
            languageOptions: {
                parserOptions: {
                    project: 'tsconfig.eslint.json'
                }
            },
            files: ['**/*.ts'],
            rules: {
                // Presenters and stores expose signals as read-only fields, and Angular composes classes through decorators.
                '@typescript-eslint/member-ordering': 'off'
            }
        }
    ];
}
