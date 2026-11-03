// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { walkRepository } from './RepositoryWalker';

// #endregion

describe('walkRepository', () => {
    let root: string;

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-walker-')));
        mkdirSync(join(root, 'src'));
        mkdirSync(join(root, 'node_modules'));
        mkdirSync(join(root, '.git'));
        writeFileSync(join(root, 'src', 'a.ts'), '');
        writeFileSync(join(root, 'node_modules', 'b.ts'), '');
        writeFileSync(join(root, '.git', 'c.ts'), '');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('leaves out hidden and generated folders', () => {
        expect(walkRepository(root)).toEqual({ files: [join(root, 'src', 'a.ts')], truncated: false });
    });

    it('stays inside the folder when a link points outside', () => {
        const outside = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-outside-')));

        writeFileSync(join(outside, 'secret.json'), '{}');
        symlinkSync(outside, join(root, 'src', 'link'));

        expect(walkRepository(root).files).toEqual([join(root, 'src', 'a.ts')]);

        rmSync(outside, { recursive: true, force: true });
    });

    it('stops at its bound and says so', () => {
        writeFileSync(join(root, 'one.ts'), '');
        writeFileSync(join(root, 'two.ts'), '');

        expect(walkRepository(root, 2).truncated).toBe(true);
    });

    it('treats a folder that cannot be read as empty', () => {
        expect(walkRepository(join(root, 'nope'))).toEqual({ files: [], truncated: false });
    });
});
