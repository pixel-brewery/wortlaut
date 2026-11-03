// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PathResolver } from './PathResolver';

// #endregion

describe('PathResolver', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-paths-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe('leavesRepository', () => {
        let outside: string;

        beforeEach(() => {
            outside = mkdtempSync(join(tmpdir(), 'wortlaut-outside-'));
            mkdirSync(join(root, '.git'));
            mkdirSync(join(root, 'i18n'));
            mkdirSync(join(root, 'shared'));
            writeFileSync(join(root, 'shared', 'lang.en.json'), '{}');
            writeFileSync(join(outside, 'profile'), 'of the user');
        });

        afterEach(() => {
            rmSync(outside, { recursive: true, force: true });
        });

        it('lets a path without a link pass, and one that does not exist yet', () => {
            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'shared', 'lang.en.json'))).toBe(false);
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(false);
        });

        it('lets a link inside of the repository pass', () => {
            // arrange
            symlinkSync(join(root, 'shared', 'lang.en.json'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(false);
        });

        it('finds a link to a file outside', () => {
            // arrange
            symlinkSync(join(outside, 'profile'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(true);
        });

        it('finds a linked folder, also for a file that does not exist yet below it', () => {
            // arrange
            symlinkSync(outside, join(root, 'i18n', 'linked'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'lang.de.json'))).toBe(true);
        });

        it('lets a link that points nowhere pass, because a write replaces the link itself', () => {
            // arrange
            symlinkSync(join(outside, 'missing'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(false);
        });

        it('takes the folder of the path as the limit where there is no repository', () => {
            // arrange
            rmSync(join(root, '.git'), { recursive: true });
            symlinkSync(join(root, 'shared', 'lang.en.json'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(true);
        });

        it('finds a linked folder where there is no repository', () => {
            // arrange
            rmSync(join(root, '.git'), { recursive: true });
            symlinkSync(outside, join(root, 'i18n', 'linked'));
            mkdirSync(join(outside, 'deep'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'lang.de.json'))).toBe(true);
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'deep', 'lang.de.json'))).toBe(true);
        });

        it('does not take a repository that a link only leads to as the limit', () => {
            // arrange
            mkdirSync(join(outside, '.git'));
            mkdirSync(join(outside, 'deep', '.git'), { recursive: true });
            symlinkSync(outside, join(root, 'i18n', 'linked'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'lang.de.json'))).toBe(true);
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'deep', 'lang.de.json'))).toBe(true);
        });

        it('does not take a repository behind a link as the limit where there is none around it', () => {
            // arrange
            rmSync(join(root, '.git'), { recursive: true });
            mkdirSync(join(outside, '.git'));
            symlinkSync(outside, join(root, 'i18n', 'linked'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'linked', 'lang.de.json'))).toBe(true);
        });

        it('takes the outer repository as the limit for a link of a nested one', () => {
            // arrange
            mkdirSync(join(root, 'i18n', '.git'));
            symlinkSync(join(root, 'shared', 'lang.en.json'), join(root, 'i18n', 'lang.de.json'));

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'i18n', 'lang.de.json'))).toBe(false);
        });

        it('takes a repository below a linked folder as it is, as with a checkout in a linked workspace', () => {
            // arrange
            mkdirSync(join(outside, 'project', '.git'), { recursive: true });
            symlinkSync(outside, join(root, 'workspace'));
            rmSync(join(root, '.git'), { recursive: true });

            // act & assert
            expect(PathResolver.leavesRepository(join(root, 'workspace', 'project', 'lang.de.json'))).toBe(false);
        });
    });

    describe('realPathOf', () => {
        it('follows a link, also for a file that does not exist yet below it', () => {
            // arrange
            const real = realpathSync(root);

            mkdirSync(join(root, 'outside'));
            mkdirSync(join(root, 'project'));
            symlinkSync(join(root, 'outside'), join(root, 'project', 'link'));

            // act
            const path = PathResolver.realPathOf(join(root, 'project', 'link', 'new', 'lang.de.json'));

            // assert
            expect(path).toBe(join(real, 'outside', 'new', 'lang.de.json'));
        });
    });

    describe('fromArgument', () => {
        it('keeps a relative path as given below the working directory of the process', () => {
            // act & assert
            expect(PathResolver.fromArgument('/project', 'assets/i18n', '/project')).toBe('assets/i18n');
        });

        it('resolves a relative path against another working directory', () => {
            // act & assert
            expect(PathResolver.fromArgument('/project', 'assets/i18n', '/elsewhere')).toBe(resolve('/project/assets/i18n'));
        });

        it('keeps an absolute path and an empty one', () => {
            // act & assert
            expect(PathResolver.fromArgument('/project', '/abs/i18n', '/elsewhere')).toBe('/abs/i18n');
            expect(PathResolver.fromArgument('/project', '', '/elsewhere')).toBe('');
        });
    });

    describe('resourceRootsFromOptions', () => {
        it('resolves an option below its base', () => {
            // act & assert
            expect(PathResolver.resourceRootsFromOptions('/project/src', ['assets/i18n'])).toEqual([join('/project/src/assets/i18n')]);
            expect(PathResolver.resourceRootsFromOptions('/project/src', '../resources')).toEqual([join('/project/resources')]);
        });

        it('reads several entries as segments when that path exists, as run() always did', () => {
            // arrange
            mkdirSync(join(root, 'assets', 'i18n'), { recursive: true });

            // act & assert
            expect(PathResolver.resourceRootsFromOptions(root, ['assets', 'i18n'])).toEqual([join(root, 'assets', 'i18n')]);
        });

        it('reads several entries as several roots otherwise', () => {
            // arrange
            mkdirSync(join(root, 'a'));
            mkdirSync(join(root, 'b'));

            // act & assert
            expect(PathResolver.resourceRootsFromOptions(root, ['a', 'b'])).toEqual([join(root, 'a'), join(root, 'b')]);
        });
    });

    describe('toOption', () => {
        it('turns a path of the working directory into one relative to root', () => {
            // act & assert
            expect(PathResolver.toOption('/project', 'src', 'src/assets/i18n')).toBe('assets/i18n');
            expect(PathResolver.toOption('/project', 'src', 'resources')).toBe('../resources');
        });
    });

    describe('isInside', () => {
        it.each([
            ['/project', '/project', true],
            ['/project', '/project/libs/a', true],
            ['/project', '/project/../other', false],
            ['/project', '/projects', false],
            ['/project', '/', false]
        ])('knows whether %s holds %s', (directory, path, expected) => {
            // act & assert
            expect(PathResolver.isInside(directory, path)).toBe(expected);
        });
    });
});
