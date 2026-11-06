// #region Imports

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { writePrivateFileAtomically } from '../io/AtomicFile.js';
import { PathResolver } from '../paths/PathResolver.js';

// #endregion

/**
 * The folder of the cache, relative to the working directory of a run.
 *
 * @public
 */
export const DEFAULT_CACHE_FOLDER = '.wortlaut/cache';

/**
 * Goes up whenever what an entry holds, or how a result comes about, changes in a way the version of the tool does not cover.
 */
const CACHE_FORMAT = 1;

/**
 * The most entries one folder keeps. Beyond it the entries that were written first go.
 */
const MAX_ENTRIES = 20000;

/**
 * An entry bigger than this is cheaper to work out again than to keep.
 */
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;

/**
 * What a run asks of the cache.
 *
 * @public
 */
export interface IResultCacheRequest {
  /**
   * The folder, relative to the working directory or absolute.
   *
   * @default '.wortlaut/cache'
   */
  folder?: string;
}

/**
 * The hash of a text, for the key of an entry.
 *
 * @public
 * @param text The text.
 * @returns The SHA-256.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Writes a value the same way for the same content, whatever the order of its fields.
 *
 * @private
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, entry]) => `${JSON.stringify(name)}:${canonical(entry)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/**
 * Keeps results of work that depends only on what its key names. An entry is found by the hash of the tool, the kind of work and
 * every input as content, never by a time stamp: a file that changed, however its dates look, is another key. Whatever cannot be
 * read back as the entry it claims to be is a miss.
 *
 * @remarks
 * The folder lives in the user's repository and holds no part of it: it is a copy of what can be worked out again, so it is the one
 * thing a run writes outside of a change set. It ignores itself in Git, and it is written only by a run that may write: a dry run
 * reads it and leaves no trace.
 *
 * @public
 */
export class ResultCache {
  // #region Fields

  private readonly _directory: string;
  private readonly _tool: string;
  private readonly _canWrite: boolean;
  private _hits: number;
  private _misses: number;
  private _writes: number;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ResultCache` class.
   *
   * @param directory The absolute folder.
   * @param tool What identifies the tool that produces the results.
   * @param canWrite Whether this run may write. Without it, the cache only reads.
   */
  public constructor(directory: string, tool: string, canWrite: boolean) {
    this._directory = directory;
    this._tool = tool;
    this._canWrite = canWrite;
    this._hits = 0;
    this._misses = 0;
    this._writes = 0;
  }

  // #endregion

  // #region Properties

  /**
   * Gets how many results were reused.
   *
   * @readonly
   */
  public get hits(): number {
    return this._hits;
  }

  /**
   * Gets how many results had to be worked out.
   *
   * @readonly
   */
  public get misses(): number {
    return this._misses;
  }

  // #endregion

  // #region Methods

  /**
   * Opens the cache of a run. A folder that leads out of the working directory through a link is refused, because a repository
   * must not be able to send a write elsewhere.
   *
   * @param cwd The working directory of the run.
   * @param request What the run asks for.
   * @param tool What identifies the tool. Without it nothing can vouch for a result, so there is no cache.
   * @param canWrite Whether this run may write.
   * @returns The cache, or `null` when the run has none.
   */
  public static open(
    cwd: string,
    request: IResultCacheRequest | undefined,
    tool: string | undefined,
    canWrite: boolean,
  ): ResultCache | null {
    if (!request || !tool) {
      return null;
    }

    const folder = request.folder ?? DEFAULT_CACHE_FOLDER;
    const directory = resolve(cwd, folder);

    if (PathResolver.isInside(cwd, directory) && !isInsideReally(cwd, directory)) {
      return null;
    }

    return new ResultCache(directory, tool, canWrite);
  }

  /**
   * Reads a result.
   *
   * @param kind The kind of work.
   * @param inputs Everything the result depends on.
   * @returns The result, or `undefined` when there is none.
   */
  public read<TValue>(kind: string, inputs: unknown): TValue | undefined {
    const key = this.keyOf(kind, inputs);

    try {
      const entry = JSON.parse(readFileSync(this.pathOf(key), 'utf8')) as {
        key?: string;
        value?: TValue;
      } | null;

      if (entry?.key === key && entry.value !== undefined) {
        this._hits++;

        return entry.value;
      }
    } catch {
      // A missing or damaged entry is the same as none.
    }

    this._misses++;

    return undefined;
  }

  /**
   * Keeps a result. A failure to write costs the next run some time and never fails this one.
   *
   * @param kind The kind of work.
   * @param inputs Everything the result depends on.
   * @param value The result, which has to survive JSON.
   */
  public write(kind: string, inputs: unknown, value: unknown): void {
    if (!this._canWrite) {
      return;
    }

    const key = this.keyOf(kind, inputs);
    const text = JSON.stringify({ key, value });

    if (text.length > MAX_ENTRY_BYTES) {
      return;
    }

    try {
      this.ignoreInGit();
      writePrivateFileAtomically(this.pathOf(key), text);
      this._writes++;
    } catch {
      // The result stands without the copy.
    }
  }

  /**
   * Returns a result, working it out only when the cache holds none.
   *
   * @param kind The kind of work.
   * @param inputs Everything the result depends on.
   * @param work Works it out.
   * @returns The result.
   */
  public remember<TValue>(kind: string, inputs: unknown, work: () => TValue): TValue {
    const known = this.read<TValue>(kind, inputs);

    if (known !== undefined) {
      return known;
    }

    const value = work();

    this.write(kind, inputs, value);

    return value;
  }

  /**
   * Keeps the folder within its bound, after a run that wrote.
   */
  public finish(): void {
    if (this._writes === 0) {
      return;
    }

    try {
      const entries = readdirSync(this._directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => join(entry.parentPath, entry.name));

      if (entries.length > MAX_ENTRIES) {
        const dated = entries
          .map((path) => ({ path, time: statSync(path).mtimeMs }))
          .sort((a, b) => a.time - b.time);

        for (const { path } of dated.slice(0, entries.length - MAX_ENTRIES)) {
          rmSync(path, { force: true });
        }
      }
    } catch {
      // A folder that cannot be tidied is still a good cache.
    }
  }

  /**
   * @private
   */
  private keyOf(kind: string, inputs: unknown): string {
    return hashText(canonical({ format: CACHE_FORMAT, tool: this._tool, kind, inputs }));
  }

  /**
   * @private
   */
  private pathOf(key: string): string {
    return join(this._directory, key.slice(0, 2), `${key}.json`);
  }

  /**
   * Keeps the folder out of Git in every repository, also one that never ran `wortlaut init`.
   *
   * @private
   */
  private ignoreInGit(): void {
    const path = join(this._directory, '.gitignore');

    if (!existsSync(path)) {
      mkdirSync(this._directory, { recursive: true });
      writeFileSync(path, '*\n', 'utf8');
    }
  }

  // #endregion
}

/**
 * Says where a folder really lies: its nearest part that exists decides.
 *
 * @private
 */
function isInsideReally(cwd: string, directory: string): boolean {
  let existing = directory;

  while (!existsSync(existing) && dirname(existing) !== existing) {
    existing = dirname(existing);
  }

  try {
    return PathResolver.isInside(realpathSync(cwd), realpathSync(existing));
  } catch {
    return false;
  }
}
