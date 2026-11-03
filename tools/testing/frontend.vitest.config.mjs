import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['tools/testing/frontend.setup.mjs'],
        include: ['libs/frontend/**/*.spec.ts'],
        fileParallelism: false,
        maxWorkers: 1
    }
});
