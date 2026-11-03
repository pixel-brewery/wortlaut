// #region Imports

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { FileSystem } from '@pixel-brewery/utilities';
import { PathResolver } from '../paths/PathResolver.js';

// #endregion

/**
 * Characters that a glob pattern reads as syntax but a folder name may hold, as in `~/code/app (copy)` or `app/[locale]`.
 */
const GLOB_SYNTAX = /[()[\]{}!*?+@|]/;

/**
 * The wildcard part of the patterns the catalog readers build.
 */
const RECURSIVE_PART = '/**/*';

/**
 * A file system for reading a project below an absolute path. Globs read a path as a pattern, so a folder with such a
 * character in its name would seem empty. This one walks such a folder instead, and leaves every other pattern alone. It
 * also finds no file that a link leads out of the repository, so a catalog cannot be a window on the rest of the disk.
 *
 * @public
 */
export class LiteralFileSystem extends FileSystem {

    // #region Methods

    /**
     * @public
     * @override
     */
    public override fileGlob(pattern: string | Array<string>): Array<string> {
        if (Array.isArray(pattern)) {
            return Array.from(new Set(pattern.flatMap((item) => this.fileGlob(item))));
        }

        return this.find(pattern).filter((file) => !PathResolver.leavesRepository(file));
    }

    /**
     * @private
     */
    private find(pattern: string): Array<string> {
        // The readers join their patterns with the separator of the platform, and a glob only knows the forward slash.
        const normalized = sep === '\\' ? pattern.replace(/\\/g, '/') : pattern;
        const recursive = normalized.indexOf(RECURSIVE_PART);
        const literal = recursive >= 0 ? normalized.slice(0, recursive) : normalized;

        if (!GLOB_SYNTAX.test(literal)) {
            // A glob answers with forward slashes, and the rest of the engine compares the paths of the platform.
            return super.fileGlob(pattern).map((file) => sep === '\\' ? normalize(file) : file);
        }

        if (!existsSync(literal)) {
            return [];
        }

        if (!statSync(literal).isDirectory()) {
            return [literal];
        }

        const extension = recursive >= 0 ? normalized.slice(recursive + RECURSIVE_PART.length) : '';

        return readdirSync(literal, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
            .map((entry) => join(entry.parentPath, entry.name));
    }

    // #endregion

}
