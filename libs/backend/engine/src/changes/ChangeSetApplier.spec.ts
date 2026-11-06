// #region Imports

import * as fs from 'node:fs';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from '../errors/EngineError';
import { ChangeSetApplier } from './ChangeSetApplier';
import { ChangeSetBuilder } from './ChangeSetBuilder';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();

  return { ...original, renameSync: vi.fn(original.renameSync) };
});

// #endregion

describe('ChangeSetApplier', () => {
  let root: string;
  let first: string;
  let second: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-applier-'));
    first = join(root, 'lang.de.json');
    second = join(root, 'lang.en.json');
    writeFileSync(first, 'old first');
    writeFileSync(second, 'old second');
  });

  afterEach(() => {
    vi.mocked(fs.renameSync).mockClear();
    rmSync(root, { recursive: true, force: true });
  });

  it('writes every file and leaves nothing else behind', () => {
    // arrange
    const changeSet = build(root, [
      [first, 'new first'],
      [second, 'new second'],
    ]);

    // act
    new ChangeSetApplier().apply(changeSet);

    // assert
    expect(readFileSync(first, 'utf8')).toBe('new first');
    expect(readFileSync(second, 'utf8')).toBe('new second');
    expect(readdirSync(root).sort()).toEqual(['lang.de.json', 'lang.en.json']);
  });

  it('creates a new file with the directories it needs', () => {
    // arrange
    const created = join(root, 'a', 'b', 'lang.fr.json');
    const changeSet = build(root, [[created, 'new']]);

    // act
    new ChangeSetApplier().apply(changeSet);

    // assert
    expect(readFileSync(created, 'utf8')).toBe('new');
  });

  it('fails, names the changed file and writes none of the others', () => {
    // arrange
    const changeSet = build(root, [
      [first, 'new first'],
      [second, 'new second'],
    ]);
    writeFileSync(second, 'edited meanwhile');

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.code).toBe('change-set-conflict');
    expect(error.message).toContain('lang.en.json');
    expect(error.files).toEqual(['lang.en.json']);
    expect(readFileSync(first, 'utf8')).toBe('old first');
    expect(readFileSync(second, 'utf8')).toBe('edited meanwhile');
    expect(readdirSync(root).sort()).toEqual(['lang.de.json', 'lang.en.json']);
  });

  it('treats a file that was deleted meanwhile as changed', () => {
    // arrange
    const changeSet = build(root, [[first, 'new first']]);
    rmSync(first);

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.code).toBe('change-set-conflict');
    expect(existsSync(first)).toBe(false);
  });

  it('treats a file that appeared meanwhile as changed, and removes the directory it made', () => {
    // arrange
    const created = join(root, 'lang.fr.json');
    const nested = join(root, 'new', 'lang.fr.json');
    const changeSet = build(root, [
      [created, 'new'],
      [nested, 'new'],
    ]);
    writeFileSync(created, 'somebody else');

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.files).toEqual(['lang.fr.json']);
    expect(readFileSync(created, 'utf8')).toBe('somebody else');
    expect(existsSync(join(root, 'new'))).toBe(false);
  });

  it('restores what it already replaced when a later write fails', () => {
    // arrange
    const created = join(root, 'lang.fr.json');
    const changeSet = build(root, [
      [first, 'new first'],
      [created, 'new created'],
      [second, 'new second'],
    ]);
    const real = vi.mocked(fs.renameSync).getMockImplementation() as typeof fs.renameSync;
    let renames = 0;

    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (++renames === 3) {
        throw new Error('disk full');
      }

      real(from, to);
    });

    try {
      // act
      const error = catchError(() => new ChangeSetApplier().apply(changeSet));

      // assert
      expect(error.code).toBe('change-set-write-failed');
      expect(error.message).toContain('lang.en.json');
      expect(readFileSync(first, 'utf8')).toBe('old first');
      expect(readFileSync(second, 'utf8')).toBe('old second');
      expect(existsSync(created)).toBe(false);
      expect(readdirSync(root).sort()).toEqual(['lang.de.json', 'lang.en.json']);
    } finally {
      vi.mocked(fs.renameSync).mockImplementation(real);
    }
  });

  it('says which files to check when even restoring fails', () => {
    // arrange
    const changeSet = build(root, [
      [first, 'new first'],
      [second, 'new second'],
    ]);
    const real = vi.mocked(fs.renameSync).getMockImplementation() as typeof fs.renameSync;
    let renames = 0;

    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (++renames >= 2) {
        throw new Error('disk full');
      }

      real(from, to);
    });

    try {
      // act
      const error = catchError(() => new ChangeSetApplier().apply(changeSet));

      // assert
      expect(error.code).toBe('change-set-write-failed');
      expect(error.files).toEqual(['lang.de.json']);
      expect(error.message).toContain('Check lang.de.json');
    } finally {
      vi.mocked(fs.renameSync).mockImplementation(real);
    }
  });

  // Windows has no such permissions.
  it.skipIf(process.platform === 'win32')('keeps the permissions of a file', () => {
    // arrange
    chmodSync(first, 0o640);
    const changeSet = build(root, [[first, 'new first']]);

    // act
    new ChangeSetApplier().apply(changeSet);

    // assert
    expect(statSync(first).mode & 0o777).toBe(0o640);
  });

  it('refuses a read-only file, although a rename could replace it', () => {
    // arrange
    chmodSync(second, 0o444);
    const changeSet = build(root, [
      [first, 'new first'],
      [second, 'new second'],
    ]);

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.code).toBe('change-set-write-failed');
    expect(error.files).toEqual(['lang.en.json']);
    expect(readFileSync(first, 'utf8')).toBe('old first');
  });

  it('writes through a symbolic link and keeps the link', () => {
    // arrange
    const real = join(root, 'shared.json');
    const link = join(root, 'lang.nl.json');
    writeFileSync(real, 'old');
    symlinkSync(real, link);
    const changeSet = build(root, [[link, 'new']]);

    // act
    new ChangeSetApplier().apply(changeSet);

    // assert
    expect(readFileSync(real, 'utf8')).toBe('new');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  describe('a link that leads out of the repository', () => {
    let outside: string;
    let secret: string;

    beforeEach(() => {
      outside = mkdtempSync(join(tmpdir(), 'wortlaut-outside-'));
      secret = join(outside, 'profile');
      writeFileSync(secret, 'of the user');
    });

    afterEach(() => {
      rmSync(outside, { recursive: true, force: true });
    });

    it('takes no part in a change set, so its target is not even read', () => {
      // arrange
      const link = join(root, 'lang.nl.json');
      symlinkSync(secret, link);

      // act & assert
      expect(() => build(root, [[link, 'new']])).toThrow(/out of its repository/);
    });

    it('takes no new file below a linked folder', () => {
      // arrange
      const folder = join(root, 'locales');
      symlinkSync(outside, folder);

      // act & assert
      expect(() => build(root, [[join(folder, 'lang.nl.json'), 'new']])).toThrow(
        /out of its repository/,
      );
      expect(readdirSync(outside)).toEqual(['profile']);
    });

    it('is refused when it took the place of a file after the change set was built', () => {
      // arrange
      const changeSet = build(root, [
        [first, 'new first'],
        [second, 'new second'],
      ]);
      rmSync(first);
      symlinkSync(secret, first);

      // act & assert
      expect(() => new ChangeSetApplier().apply(changeSet)).toThrow(
        /out of its repository. Nothing was written/,
      );
      expect(readFileSync(secret, 'utf8')).toBe('of the user');
      expect(readFileSync(second, 'utf8')).toBe('old second');
    });
  });

  it('excludes another process that is writing the same file right now', () => {
    // arrange
    const changeSet = build(root, [[first, 'new first']]);
    writeFileSync(join(root, '.lang.de.json.wortlaut-staged'), 'in progress');

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.code).toBe('change-set-conflict');
    expect(readFileSync(first, 'utf8')).toBe('old first');
  });

  it('takes over from a crashed process after a while', () => {
    // arrange
    const changeSet = build(root, [[first, 'new first']]);
    const staged = join(root, '.lang.de.json.wortlaut-staged');
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    writeFileSync(staged, 'left behind');
    utimesSync(staged, longAgo, longAgo);

    // act
    new ChangeSetApplier().apply(changeSet);

    // assert
    expect(readFileSync(first, 'utf8')).toBe('new first');
    expect(existsSync(staged)).toBe(false);
  });

  it('writes a change set twice only once: the second apply finds the file changed', () => {
    // arrange
    const changeSet = build(root, [[first, 'new first']]);
    new ChangeSetApplier().apply(changeSet);

    // act
    const error = catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(error.code).toBe('change-set-conflict');
  });

  it('keeps a directory that holds other files when it cleans up', () => {
    // arrange
    const directory = join(root, 'keep');
    mkdirSync(directory);
    writeFileSync(join(directory, 'other.json'), 'other');
    const changeSet = build(root, [
      [join(directory, 'lang.fr.json'), 'new'],
      [second, 'new second'],
    ]);
    writeFileSync(second, 'edited');

    // act
    catchError(() => new ChangeSetApplier().apply(changeSet));

    // assert
    expect(readdirSync(directory)).toEqual(['other.json']);
  });
});

function build(cwd: string, proposals: Array<[string, string]>): ChangeSet {
  const builder = new ChangeSetBuilder('set-1', cwd, new Date('2026-11-02T10:00:00.000Z'), {
    command: 'sort',
    surface: 'cli',
    runId: 'run-1',
    detail: null,
  });

  for (const [path, content] of proposals) {
    builder.propose(path, content);
  }

  return builder.build(false);
}

function catchError(action: () => void): EngineError {
  try {
    action();
  } catch (error) {
    return error as EngineError;
  }

  throw new Error('Expected a failure.');
}
