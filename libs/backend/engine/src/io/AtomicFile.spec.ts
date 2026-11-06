// #region Imports

import * as fs from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renameOver } from './AtomicFile';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();

  return { ...original, renameSync: vi.fn(original.renameSync) };
});

// #endregion

describe('renameOver', () => {
  const real = vi.mocked(fs.renameSync).getMockImplementation() as typeof fs.renameSync;
  let root: string;
  let from: string;
  let to: string;

  function refuse(code: string, times: number): void {
    let refused = 0;

    vi.mocked(fs.renameSync).mockImplementation((source, target) => {
      if (refused++ < times) {
        throw Object.assign(new Error(code), { code });
      }

      real(source, target);
    });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-rename-'));
    from = join(root, 'from');
    to = join(root, 'to');
    writeFileSync(from, 'new');
    writeFileSync(to, 'old');
    vi.mocked(fs.renameSync).mockClear();
  });

  afterEach(() => {
    vi.mocked(fs.renameSync).mockImplementation(real);
    rmSync(root, { recursive: true, force: true });
  });

  it('waits out a target that another program holds on Windows', () => {
    // arrange
    refuse('EPERM', 2);

    // act
    renameOver(from, to, 'win32');

    // assert
    expect(readFileSync(to, 'utf8')).toBe('new');
    expect(existsSync(from)).toBe(false);
    expect(fs.renameSync).toHaveBeenCalledTimes(3);
  });

  it('gives up with the error of the system when the target stays held', () => {
    // arrange
    refuse('EBUSY', Number.POSITIVE_INFINITY);

    // act & assert
    expect(() => renameOver(from, to, 'win32')).toThrow('EBUSY');
    expect(fs.renameSync).toHaveBeenCalledTimes(6);
    expect(readFileSync(to, 'utf8')).toBe('old');
  });

  it('does not wait for an error that time does not solve', () => {
    // arrange
    refuse('ENOENT', Number.POSITIVE_INFINITY);

    // act & assert
    expect(() => renameOver(from, to, 'win32')).toThrow('ENOENT');
    expect(fs.renameSync).toHaveBeenCalledTimes(1);
  });

  it('does not wait on other platforms, where the same error is final', () => {
    // arrange
    refuse('EPERM', Number.POSITIVE_INFINITY);

    // act & assert
    expect(() => renameOver(from, to, 'linux')).toThrow('EPERM');
    expect(fs.renameSync).toHaveBeenCalledTimes(1);
  });
});
