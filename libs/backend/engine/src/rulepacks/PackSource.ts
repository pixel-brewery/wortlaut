// #region Imports

import { existsSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { PackProblem } from './PackProblem.js';

// #endregion

/**
 * What a GitHub owner looks like.
 */
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * What a GitHub repository looks like.
 */
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * What a branch, a tag or a commit looks like.
 */
const GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

/**
 * What the name of an npm package looks like.
 */
const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * What a version or a dist tag looks like.
 */
const NPM_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;

/**
 * Where a pack comes from.
 *
 * @public
 */
export type PackSource =
  | { kind: 'github'; owner: string; repository: string; ref: string | null }
  | { kind: 'npm'; name: string; version: string | null }
  | { kind: 'folder'; path: string }
  | { kind: 'shipped'; id: string };

/**
 * Reads what a user or a lock file names as a source of a pack. It looks only at the text, and at whether a folder of that name
 * exists: nothing is fetched.
 *
 * @public
 */
export namespace PackSources {
  /**
   * Reads a source.
   *
   * @param text The source, such as `github:owner/repository`, `@scope/package` or `./rules/our-pack`.
   * @param directory The directory that a folder is relative to.
   * @returns The source.
   * @throws PackProblem for text that names nothing Wortlaut can fetch.
   */
  export function parse(text: string, directory: string): PackSource {
    const value = text.trim();

    if (value.startsWith('github:')) {
      return parseGitHub(value.slice('github:'.length));
    }

    if (value.startsWith('npm:')) {
      return parseNpm(value.slice('npm:'.length));
    }

    if (value.startsWith('wortlaut:')) {
      return { kind: 'shipped', id: value.slice('wortlaut:'.length) };
    }

    if (value.startsWith('folder:')) {
      return { kind: 'folder', path: resolve(directory, value.slice('folder:'.length)) };
    }

    if (
      /^(?:\.{1,2}[/\\]|\.{1,2}$|\/|[A-Za-z]:[/\\])/.test(value) ||
      isFolder(resolve(directory, value))
    ) {
      return { kind: 'folder', path: resolve(directory, value) };
    }

    return parseNpm(value);
  }

  /**
   * Writes a source the way a lock file and a command line name it.
   *
   * @param source The source.
   * @param directory The directory that a folder is written relative to.
   * @returns The text.
   */
  export function print(source: PackSource, directory: string): string {
    switch (source.kind) {
      case 'github':
        return `github:${source.owner}/${source.repository}${source.ref ? `#${source.ref}` : ''}`;
      case 'npm':
        return `npm:${source.name}${source.version ? `@${source.version}` : ''}`;
      case 'shipped':
        return `wortlaut:${source.id}`;
      default:
        return `folder:${relative(directory, source.path).split(sep).join('/') || '.'}`;
    }
  }

  /**
   * @private
   */
  function parseGitHub(value: string): PackSource {
    const [path, ref, ...rest] = value.split('#');
    const parts = path.split('/');
    const isValid =
      parts.length === 2 &&
      GITHUB_OWNER.test(parts[0]) &&
      GITHUB_REPOSITORY.test(parts[1]) &&
      !/^\.+$/.test(parts[1]) &&
      rest.length === 0 &&
      (ref === undefined || (GIT_REF.test(ref) && !ref.includes('..')));

    if (!isValid) {
      throw new PackProblem(
        'not-found',
        'Write a GitHub repository like github:owner/repository, with #branch if you need one.',
      );
    }

    return { kind: 'github', owner: parts[0], repository: parts[1], ref: ref ?? null };
  }

  /**
   * @private
   */
  function parseNpm(value: string): PackSource {
    const at = value.indexOf('@', 1);
    const name = at > 0 ? value.slice(0, at) : value;
    const version = at > 0 ? value.slice(at + 1) : null;

    if (
      !NPM_NAME.test(name) ||
      name.length > 214 ||
      (version !== null && !NPM_VERSION.test(version))
    ) {
      throw new PackProblem(
        'not-found',
        'Write an npm package like @scope/package, with @1.2.0 if you need a version.',
      );
    }

    return { kind: 'npm', name, version };
  }

  /**
   * @private
   */
  function isFolder(path: string): boolean {
    return existsSync(path) && statSync(path).isDirectory();
  }
}
