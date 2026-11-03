// #region Imports

import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// #endregion

/**
 * The one place that decides what `root` and `resourceRoot` mean.
 *
 * @remarks
 * An argument of a command is relative to the working directory. An option of the executor or of a configuration file is
 * relative to the directory of its file, and `resourceRoot` to `root` below it. So `--resource-root assets/i18n` and
 * `{ root: 'src', resourceRoot: ['assets/i18n'] }` point at different folders, which existing targets rely on.
 *
 * @public
 */
export namespace PathResolver {

    /**
     * Resolves a path given as an argument, against the working directory. Below the process's own working directory the
     * text stays as it is: the catalogs are found through glob patterns, and an absolute path would turn characters such
     * as `[` in a parent directory into pattern syntax.
     *
     * @public
     * @param cwd The absolute working directory of the command.
     * @param value The path as given. Empty stays empty.
     * @param processCwd The working directory of the process.
     * @returns The path for readers.
     */
    export function fromArgument(cwd: string, value: string, processCwd: string = process.cwd()): string {
        if (!value || isAbsolute(value) || resolve(cwd) === resolve(processCwd)) {
            return value;
        }

        return resolve(cwd, value);
    }

    /**
     * Resolves the `resourceRoot` of options against its base directory. Several entries are a path in segments when that
     * path exists, which is what `run()` always made of them, and otherwise several roots.
     *
     * @public
     * @param base The directory the entries are relative to.
     * @param resourceRoot The option.
     * @returns The resource roots.
     */
    export function resourceRootsFromOptions(base: string, resourceRoot: string | ReadonlyArray<string>): Array<string> {
        const entries = typeof resourceRoot === 'string' ? [resourceRoot] : [...resourceRoot];
        const joined = join(base, ...entries);

        if (entries.length <= 1 || isDirectory(joined)) {
            return [joined];
        }

        return entries.map((entry) => join(base, entry));
    }

    /**
     * Turns a path relative to the working directory into the form of an option, relative to `root`, for a new
     * configuration file.
     *
     * @public
     * @param cwd The working directory.
     * @param root The `root` option, relative to the working directory.
     * @param value The path, relative to the working directory.
     * @returns The path relative to `root`, with forward slashes.
     */
    export function toOption(cwd: string, root: string, value: string): string {
        return relative(resolve(cwd, root), resolve(cwd, value)).split(sep)
            .join('/');
    }

    /**
     * Returns whether a path stays inside a directory.
     *
     * @public
     * @param directory The directory.
     * @param path The path.
     * @returns `true` when the path is the directory or below it.
     */
    export function isInside(directory: string, path: string): boolean {
        const fromDirectory = relative(resolve(directory), resolve(path));

        return fromDirectory === '' || !(fromDirectory === '..' || fromDirectory.startsWith(`..${sep}`) || isAbsolute(fromDirectory));
    }

    /**
     * Returns where a path really is, with every link on its way resolved. The part of a path that does not exist yet stays as
     * it is, so a file that would be created below a link counts where the link points.
     *
     * @public
     * @param path The path.
     * @returns The absolute path.
     */
    export function realPathOf(path: string): string {
        const missing = new Array<string>();
        let current = resolve(path);

        for (;;) {
            try {
                return join(realpathSync(current), ...missing);
            } catch {
                const parent = dirname(current);

                if (parent === current) {
                    return resolve(path);
                }

                missing.unshift(basename(current));
                current = parent;
            }
        }
    }

    /**
     * Returns whether a link on the way to a path leads out of the repository the path seems to be in. A repository is not
     * trusted, so its links must not decide what Wortlaut reads and writes, as `lang.de.json -> ~/.zshrc` would. Without a
     * repository, the folder of the path is the limit.
     *
     * @public
     * @param path The path.
     * @returns `true` when the path really lies outside of its repository.
     */
    export function leavesRepository(path: string): boolean {
        const lexical = resolve(path);
        const real = realPathOf(lexical);

        return real !== lexical && !isInside(realPathOf(limitOf(lexical)), real);
    }

    /**
     * Finds how far a link may lead: the repository around a path, by its outermost `.git`, so a repository that a link only
     * leads to does not count. Without a repository, it is what holds the lowest link on the way, or else the folder of the path.
     *
     * @private
     */
    function limitOf(path: string): string {
        const parents = parentsOf(path);
        const repository = parents.filter((parent) => !isLink(parent) && existsSync(join(parent, '.git'))).at(-1);

        if (repository) {
            return repository;
        }

        const link = isLink(path) ? path : parents.find((parent) => isLink(parent));

        return dirname(link ?? path);
    }

    /**
     * Lists the folders around a path, the nearest first. The home folder ends them: it may be a repository of dotfiles, and
     * that says nothing about the folders below it.
     *
     * @private
     */
    function parentsOf(path: string): Array<string> {
        const home = homedir();
        const parents = new Array<string>();

        for (let current = dirname(path); current !== home && current !== dirname(current); current = dirname(current)) {
            parents.push(current);
        }

        return parents;
    }

    /**
     * @private
     */
    function isLink(path: string): boolean {
        return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
    }

    /**
     * @private
     */
    function isDirectory(path: string): boolean {
        return existsSync(path) && statSync(path).isDirectory();
    }

}
