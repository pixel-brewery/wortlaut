// #region Imports

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReviewList } from './ReviewList';

// #endregion

describe('ReviewList', () => {
  let root: string;
  let directory: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-review-'));
    directory = join(root, 'changes');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stores a change set as pending, visible to another process', () => {
    // arrange
    const list = new ReviewList(directory);

    // act
    const stored = list.add(createChangeSet('20261102-a'));
    const fromOtherProcess = new ReviewList(directory).get('20261102-a');

    // assert
    expect(stored.state).toBe('pending');
    expect(fromOtherProcess).toEqual(stored);
  });

  it('lists the pending change sets, oldest first', () => {
    // arrange
    const list = new ReviewList(directory);
    list.add(createChangeSet('20261102-b'));
    list.add(createChangeSet('20261102-a'));

    // act
    const ids = list.list().map((changeSet) => changeSet.id);

    // assert
    expect(ids).toEqual(['20261102-a', '20261102-b']);
  });

  it('is empty before anything was added', () => {
    // act & assert
    expect(new ReviewList(directory).list()).toEqual([]);
  });

  it('removes a change set, and removing it twice does no harm', () => {
    // arrange
    const list = new ReviewList(directory);
    list.add(createChangeSet('20261102-a'));

    // act
    list.remove('20261102-a');
    list.remove('20261102-a');

    // assert
    expect(list.list()).toEqual([]);
  });

  it('does not reach outside of its directory through an id', () => {
    // arrange
    const outside = join(root, 'precious.json');
    writeFileSync(outside, '{}');
    const list = new ReviewList(directory);

    // act
    list.remove('../precious');

    // assert
    expect(existsSync(outside)).toBe(true);
    expect(() => list.get('../precious')).toThrow(/no change set/);
  });

  it('says so when a change set is not in the list', () => {
    // act & assert
    expect(() => new ReviewList(directory).get('nope')).toThrow(/no change set 'nope'/);
  });

  it('refuses more change sets than its bound', () => {
    // arrange
    const list = new ReviewList(directory, 1);
    list.add(createChangeSet('20261102-a'));

    // act & assert
    expect(() => list.add(createChangeSet('20261102-b'))).toThrow(/already holds 1/);
  });

  it('skips a broken file and leaves it where it is', () => {
    // arrange
    const list = new ReviewList(directory);
    list.add(createChangeSet('20261102-a'));
    writeFileSync(join(directory, 'broken.json'), 'not json');

    // act
    const ids = list.list().map((changeSet) => changeSet.id);

    // assert
    expect(ids).toEqual(['20261102-a']);
    expect(readdirSync(directory)).toContain('broken.json');
  });

  it('rejects a change set that does not match its contract', () => {
    // act & assert
    expect(() =>
      new ReviewList(directory).add({
        ...createChangeSet('20261102-a'),
        apiKey: 'sk-secret',
      } as ChangeSet),
    ).toThrow();
    expect(existsSync(directory)).toBe(false);
  });
});

function createChangeSet(id: string): ChangeSet {
  return {
    schemaVersion: 1,
    id,
    state: 'proposed',
    createdAt: '2026-11-02T10:00:00.000Z',
    cwd: '/project',
    source: { command: 'sort', surface: 'cli', runId: 'run', detail: null },
    files: [],
    findings: [],
    partial: false,
  };
}
