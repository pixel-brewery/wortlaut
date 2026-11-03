import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const profile = join(tmpdir(), `wortlaut-cli-specs-${process.pid}`);

// The workers write here, and the process that started them cleans up when the run is over.
process.once('exit', () => {
    rmSync(profile, { recursive: true, force: true });
});

export default defineConfig({
    root: './src',
    test: {
        include: ['**/*.{[sS]pec,[tT]est}.?(c|m)[jt]s?(x)'],
        // Commands record their runs; specs must not touch the user's real profile.
        env: {
            WORTLAUT_HOME: profile
        }
    }
});
