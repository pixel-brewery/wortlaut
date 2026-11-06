// #region Imports

import { describe, expect, it } from 'vitest';
import { ChangeSetSchema, type ChangeSet } from './ChangeSet';

// #endregion

describe('ChangeSetSchema', () => {
  it('accepts a change set', () => {
    // act
    const result = ChangeSetSchema.safeParse(createChangeSet());

    // assert
    expect(result.success).toBe(true);
  });

  it('rejects a field nobody declared, so a secret cannot slip into a stored change set', () => {
    // act
    const result = ChangeSetSchema.safeParse({ ...createChangeSet(), apiKey: 'sk-secret' });

    // assert
    expect(result.success).toBe(false);
  });

  it('rejects an id that could leave the directory of the review list', () => {
    // act
    const result = ChangeSetSchema.safeParse({ ...createChangeSet(), id: '../../evil' });

    // assert
    expect(result.success).toBe(false);
  });

  it('rejects an instant that is not UTC', () => {
    // act
    const result = ChangeSetSchema.safeParse({
      ...createChangeSet(),
      createdAt: '2026-11-02T10:00:00+01:00',
    });

    // assert
    expect(result.success).toBe(false);
  });
});

function createChangeSet(): ChangeSet {
  return {
    schemaVersion: 1,
    id: '20261102T100000000Z-abcd',
    state: 'pending',
    createdAt: '2026-11-02T10:00:00.000Z',
    cwd: '/project',
    source: { command: 'sort', surface: 'cli', runId: 'run', detail: null },
    files: [
      {
        path: '/project/lang.en.json',
        displayPath: 'lang.en.json',
        action: 'update',
        oldContent: '{}',
        oldHash: 'a',
        newContent: '{ }',
        newHash: 'b',
      },
    ],
    findings: [],
    partial: false,
  };
}
