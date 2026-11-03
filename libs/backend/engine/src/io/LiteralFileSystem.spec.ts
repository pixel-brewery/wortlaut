// #region Imports

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiteralFileSystem } from './LiteralFileSystem';

// #endregion

describe('LiteralFileSystem', () => {
    let root: string;

    function write(...segments: Array<string>): string {
        const file = join(root, ...segments);

        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, '{}');

        return file;
    }

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-literal-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('answers a pattern with the paths of the platform, as every other path of the engine is', () => {
        // arrange
        const file = write('i18n', 'lang.en.json');

        // act & assert
        expect(new LiteralFileSystem().fileGlob(join(root, '**/*.json'))).toEqual([file]);
    });

    it('walks a folder whose name reads as glob syntax', () => {
        // arrange
        const file = write('app (copy)', 'i18n', 'lang.en.json');

        // act & assert
        expect(new LiteralFileSystem().fileGlob(join(root, 'app (copy)', '**/*.json'))).toEqual([file]);
    });

    describe('links', () => {
        let outside: string;

        beforeEach(() => {
            outside = mkdtempSync(join(tmpdir(), 'wortlaut-outside-'));
            writeFileSync(join(outside, 'auth.json'), '{}');
        });

        afterEach(() => {
            rmSync(outside, { recursive: true, force: true });
        });

        it('finds no file that a link leads out of the repository', () => {
            // arrange
            const file = write('i18n', 'lang.en.json');
            symlinkSync(join(outside, 'auth.json'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(new LiteralFileSystem().fileGlob(join(root, '**/*.json'))).toEqual([file]);
        });

        it('finds nothing through a folder that a link leads out of the repository', () => {
            // arrange
            symlinkSync(outside, join(root, 'i18n'));

            // act & assert
            expect(new LiteralFileSystem().fileGlob(join(root, 'i18n', '**/*.json'))).toEqual([]);
        });

        it('finds a file that a link leads to inside of the repository', () => {
            // arrange
            mkdirSync(join(root, '.git'));
            const shared = write('shared', 'lang.en.json');
            mkdirSync(join(root, 'i18n'));
            symlinkSync(shared, join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(new LiteralFileSystem().fileGlob(join(root, 'i18n', '**/*.json'))).toEqual([join(root, 'i18n', 'lang.de.json')]);
        });
    });

    it('takes several patterns and names a file once', () => {
        // arrange
        const json = write('src', 'lang.en.json');
        const source = write('src', 'view.ts');

        // act
        const files = new LiteralFileSystem().fileGlob([join(root, '**/*.json'), join(root, '**/*.ts'), join(root, 'src/*.ts')]);

        // assert
        expect(files.sort()).toEqual([json, source].sort());
    });
});
