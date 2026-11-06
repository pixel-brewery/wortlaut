import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: './src',
  test: {
    include: ['**/*.{[sS]pec,[tT]est}.?(c|m)[jt]s?(x)'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
