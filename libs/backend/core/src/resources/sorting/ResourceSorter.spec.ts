// #region Imports

import type { IFileSystem, ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import type { IResourceInfo } from '../models/interfaces/IResourceInfo';
import { ResourceSorter } from './ResourceSorter';

// #endregion

describe('ResourceSorter', () => {
  it('writes a resource whose document order changes', () => {
    // arrange
    const { sorter, fileSystem } = createSorter(false);

    // act
    sorter.sort([createResource(['b', 'a'], ['a', 'b'])]);

    // assert
    expect(fileSystem.fileWriteAllText).toHaveBeenCalledOnce();
  });

  it('leaves a resource alone that is already in order', () => {
    // arrange
    const { sorter, fileSystem } = createSorter(false);

    // act
    sorter.sort([createResource(['a', 'b'], ['a', 'b'])]);

    // assert
    expect(fileSystem.fileWriteAllText).not.toHaveBeenCalled();
  });

  it('works out a plan without writing, also outside of a dry run', () => {
    // arrange
    const { sorter, fileSystem } = createSorter(false);

    // act
    const plans = sorter.plan([createResource(['b', 'a'], ['a', 'b'])]);

    // assert
    expect(plans[0].keysSorted).toBe(2);
    expect(fileSystem.fileWriteAllText).not.toHaveBeenCalled();
  });

  it('writes nothing in a dry run', () => {
    // arrange
    const { sorter, fileSystem } = createSorter(true);

    // act
    sorter.sort([createResource(['b', 'a'], ['a', 'b'])]);

    // assert
    expect(fileSystem.fileWriteAllText).not.toHaveBeenCalled();
  });
});

function createSorter(dryRun: boolean) {
  const fileSystem = { fileWriteAllText: vi.fn() } as unknown as IFileSystem;
  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;

  return { sorter: new ResourceSorter(logger, fileSystem, { dryRun, order: 'asc' }), fileSystem };
}

/**
 * A resource whose `keys` are always sorted, like the real ones, while `entries` follows the document.
 */
function createResource(before: Array<string>, after: Array<string>): IResourceInfo {
  let order = before;
  const resource = {
    name: 'lang.en.json',
    path: 'lang.en.json',
    clone: () => resource,
    keys: () => [...order].sort((a, b) => a.localeCompare(b)),
    entries: () => order.map((key) => [key, key]),
    sort: () => {
      order = after;

      return resource;
    },
    toString: () => '',
  };

  return resource as unknown as IResourceInfo;
}
