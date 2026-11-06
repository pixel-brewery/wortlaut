import { configs } from '@pixel-brewery/eslint-config';
import prettier from 'eslint-config-prettier/flat';

// Prettier owns layout and punctuation. ESLint retains the shared code rules.
export const baseConfig = [...configs.base, prettier];
