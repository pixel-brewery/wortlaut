// #region Imports

import { readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawOutputFile } from './RawOutputFile';

// #endregion

describe('createRawOutputFile', () => {
    const file = join(tmpdir(), 'wortlaut-raw-spec-run.log');

    afterEach(() => {
        rmSync(file, { force: true });
    });

    it('keeps every answer in a private temporary file and says where, once', () => {
        // arrange
        const log = vi.fn();
        const keep = createRawOutputFile('spec-run', log);

        // act
        keep('first answer');
        keep('second answer');

        // assert
        expect(readFileSync(file, 'utf8')).toBe('first answer\nsecond answer\n');
        expect(statSync(file).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
        expect(log).toHaveBeenCalledOnce();
        expect(log).toHaveBeenCalledWith(`Raw answers go to ${file}`);
    });
});
