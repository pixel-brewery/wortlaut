import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: fileURLToPath(new URL('./src', import.meta.url)),
    test: {
        include: ['**/*.spec.ts'],
        // Specs must not touch the user's real profile, even when one forgets to pass its own.
        env: {
            WORTLAUT_HOME: join(tmpdir(), `wortlaut-mcp-specs-${process.pid}`)
        },
        coverage: {
            reporter: ['text', 'json', 'html']
        }
    }
});
