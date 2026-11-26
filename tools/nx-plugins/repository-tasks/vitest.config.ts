// #region Imports

import { defineConfig } from 'vitest/config';

// #endregion

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/nx-plugins/repository-tasks/src/**/*.spec.ts'],
  },
});
