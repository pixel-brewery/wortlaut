// #region Imports

import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readPackArchive } from './PackArchive';
import { PACK_LIMITS } from './PackLimits';
import { PackProblem } from './PackProblem';
import { createTar, createTarball } from './testing/PackFixtures';

// #endregion

function problemOf(action: () => unknown): ReturnType<PackProblem['describe']> {
  try {
    action();
  } catch (error) {
    if (error instanceof PackProblem) {
      return error.describe();
    }

    throw error;
  }

  throw new Error('It did not refuse.');
}

describe('readPackArchive', () => {
  it('reads the files below the one top folder, in memory', () => {
    // act
    const files = readPackArchive(
      createTarball([
        { path: 'owner-repo-abc/', type: '5' },
        { path: 'owner-repo-abc/wortlaut-pack.json', content: '{}' },
        { path: 'owner-repo-abc/docs/README.md', content: 'Hello' },
      ]),
    );

    // assert
    expect(files.map((file) => [file.path, file.bytes.toString()])).toEqual([
      ['wortlaut-pack.json', '{}'],
      ['docs/README.md', 'Hello'],
    ]);
  });

  it.each([
    ['a parent folder', 'package/../../evil.json'],
    ['a parent folder at the start', '../evil.json'],
    ['an absolute path', '/etc/evil.json'],
    ['a Windows path', 'C:/evil.json'],
    ['a backslash', 'package\\..\\evil.json'],
  ])('refuses the whole archive for a path with %s', (_name, path) => {
    // act
    const problem = problemOf(() =>
      readPackArchive(
        createTarball([
          { path: 'package/wortlaut-pack.json', content: '{}' },
          { path, content: 'x' },
        ]),
      ),
    );

    // assert
    expect(problem).toMatchObject({
      kind: 'unsafe',
      message: expect.stringContaining('leaves the pack'),
    });
  });

  it.each([
    ['a symbolic link', '2'],
    ['a hard link', '1'],
    ['a device', '3'],
    ['a pipe', '6'],
  ])('refuses %s', (_name, type) => {
    // act
    const problem = problemOf(() =>
      readPackArchive(createTarball([{ path: 'package/wortlaut-pack.json', content: '', type }])),
    );

    // assert
    expect(problem).toMatchObject({
      kind: 'unsafe',
      message: expect.stringContaining('link or a special file'),
    });
  });

  it('refuses a file over the bound on one file', () => {
    // act
    const problem = problemOf(() =>
      readPackArchive(
        createTarball([
          { path: 'package/big.json', content: Buffer.alloc(PACK_LIMITS.maxFileBytes + 1) },
        ]),
      ),
    );

    // assert
    expect(problem).toMatchObject({
      kind: 'too-large',
      message: expect.stringContaining('package/big.json'),
    });
  });

  it('stops an archive that expands without end', () => {
    // arrange
    const bomb = gzipSync(Buffer.alloc(PACK_LIMITS.maxUnpackedBytes + 1024));

    // act
    const problem = problemOf(() => readPackArchive(bomb));

    // assert
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(problem.kind).toBe('too-large');
  });

  it('refuses more files than a pack may hold', () => {
    // arrange
    const entries = Array.from({ length: PACK_LIMITS.maxFiles + 1 }, (_, index) => ({
      path: `package/${index}.json`,
      content: '{}',
    }));

    // act & assert
    expect(problemOf(() => readPackArchive(createTarball(entries))).kind).toBe('too-large');
  });

  it('refuses an archive that lies about a size or is damaged', () => {
    // arrange
    const lying = gzipSync(
      createTar([{ path: 'package/a.json', content: 'x', size: 9000 }]).subarray(0, 1024),
    );
    const damaged = createTar([{ path: 'package/a.json', content: 'x' }]);

    damaged[10] = 65;

    // act & assert
    expect(problemOf(() => readPackArchive(lying))).toMatchObject({
      kind: 'unsafe',
      message: expect.stringContaining('cut off'),
    });
    expect(problemOf(() => readPackArchive(gzipSync(damaged)))).toMatchObject({
      kind: 'unsafe',
      message: expect.stringContaining('damaged'),
    });
  });

  it('says so for what is no archive at all', () => {
    expect(problemOf(() => readPackArchive(Buffer.from('<html>Not found</html>'))).kind).toBe(
      'unsafe',
    );
  });
});
