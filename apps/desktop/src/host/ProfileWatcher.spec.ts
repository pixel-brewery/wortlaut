// #region Imports

import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileWatcher } from './ProfileWatcher';

// #endregion

describe('ProfileWatcher', () => {
    let root: string;
    let watcher: ProfileWatcher;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-watcher-'));
        watcher = new ProfileWatcher();
    });

    afterEach(() => {
        watcher.close();
        rmSync(root, { recursive: true, force: true });
    });

    it('tells when another process leaves a file in a folder, once for a burst, and creates a folder that is not there yet', async () => {
        // arrange
        const onChange = vi.fn();
        const folder = join(root, 'changes');

        watcher.watch(folder, onChange);

        // A new watch on macOS misses what happens before its stream has started.
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });

        // act: the way another process writes, a temporary file and a rename
        writeFileSync(join(folder, '.a.tmp'), '{}');
        renameSync(join(folder, '.a.tmp'), join(folder, 'a.json'));
        writeFileSync(join(folder, '.b.tmp'), '{}');
        renameSync(join(folder, '.b.tmp'), join(folder, 'b.json'));

        // assert
        await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 10_000 });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('tells nobody after it was closed', async () => {
        // arrange
        const onChange = vi.fn();
        const folder = join(root, 'runs');

        watcher.watch(folder, onChange);
        writeFileSync(join(folder, 'a.json'), '{}');

        // act
        watcher.close();
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });

        // assert
        expect(onChange).not.toHaveBeenCalled();
    });
});
