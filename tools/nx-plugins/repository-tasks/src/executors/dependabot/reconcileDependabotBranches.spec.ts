// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { reconcileDependabotBranches } from './reconcileDependabotBranches.mjs';

// #endregion

const root = 'repos/pixel-brewery/wortlaut';
const main = 'a'.repeat(40);
const oldHead = 'b'.repeat(40);
const newHead = 'c'.repeat(40);
const context = {
  eventName: 'schedule',
  repository: 'pixel-brewery/wortlaut',
  repositoryId: 1444820071,
  defaultBranch: 'main',
};

function controlled() {
  const repository = {
    id: 1444820071,
    name: 'wortlaut',
    full_name: 'pixel-brewery/wortlaut',
    default_branch: 'main',
    fork: false,
    private: false,
    visibility: 'public',
  };
  const pull = {
    number: 7,
    state: 'open',
    draft: false,
    merged: false,
    user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { sha: oldHead, ref: 'dependabot/npm_and_yarn/frameworks', repo: repository },
    base: { ref: 'main', sha: main, repo: repository },
  };
  const records = {
    pull,
    inventory: [pull],
    behind: 1,
    advanceAt: 2,
    changedAt: 99,
    runs: [] as Record<string, unknown>[],
  };
  let reads = 0;
  const request = vi.fn((method: string, endpoint: string) => {
    if (endpoint === 'repositories/1444820071') return structuredClone(repository);
    if (endpoint === `${root}/actions/workflows/ci.yml`)
      return {
        id: 101,
        name: 'Desktop quality',
        state: 'active',
        path: '.github/workflows/ci.yml',
      };
    if (endpoint === `${root}/pulls?state=open&base=main&per_page=100&page=1`)
      return structuredClone(records.inventory);
    if (endpoint === `${root}/pulls/7`) {
      reads++;
      return {
        ...structuredClone(records.pull),
        head: {
          ...structuredClone(records.pull.head),
          sha:
            reads >= records.changedAt
              ? 'd'.repeat(40)
              : reads >= records.advanceAt
                ? newHead
                : oldHead,
        },
      };
    }
    if (endpoint === `${root}/branches/main`) return { name: 'main', commit: { sha: main } };
    if (endpoint.startsWith(`${root}/compare/`))
      return { behind_by: records.behind, merge_base_commit: { sha: main } };
    if (endpoint.endsWith('/update-branch') && method === 'PUT') return { message: 'Updating' };
    if (endpoint.includes('/actions/workflows/ci.yml/runs?'))
      return { total_count: records.runs.length, workflow_runs: structuredClone(records.runs) };
    if (endpoint.endsWith('/dispatches') && method === 'POST') return undefined;
    throw new Error('Unexpected test request.');
  });
  return { records, repository, request, wait: vi.fn(async () => undefined) };
}

function writes(request: ReturnType<typeof controlled>['request']) {
  return request.mock.calls.filter(([method]) => method !== 'GET');
}

describe('Dependabot branch reconciliation', () => {
  it('updates only the expected stale head and dispatches verification for its replacement', async () => {
    // arrange
    const fixture = controlled();

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'verification-requested', head: newHead }]);
    expect(writes(fixture.request)).toEqual([
      ['PUT', `${root}/pulls/7/update-branch`, { expected_head_sha: oldHead }],
      [
        'POST',
        `${root}/actions/workflows/ci.yml/dispatches`,
        {
          ref: 'dependabot/npm_and_yarn/frameworks',
          inputs: { expected_head_sha: newHead },
        },
      ],
    ]);
  });

  it('does not touch a contributor pull request', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.pull.user = { login: 'contributor', type: 'User' };

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([]);
    expect(writes(fixture.request)).toEqual([]);
  });

  it('does not restart a failed verification of a current branch', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.behind = 0;
    fixture.records.advanceAt = 99;
    fixture.records.runs = [
      {
        workflow_id: 101,
        head_sha: oldHead,
        head_branch: fixture.records.pull.head.ref,
        event: 'pull_request',
        repository: fixture.repository,
        head_repository: fixture.repository,
        status: 'completed',
        conclusion: 'failure',
      },
    ];

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([
      { number: 7, status: 'waiting', reason: 'verification-already-requested' },
    ]);
    expect(writes(fixture.request)).toEqual([]);
  });

  it('does not dispatch a branch that changes during the final read', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.changedAt = 3;

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'skipped', reason: 'pull-request-changed' }]);
    expect(writes(fixture.request)).toEqual([
      ['PUT', `${root}/pulls/7/update-branch`, { expected_head_sha: oldHead }],
    ]);
  });

  it('bounds an asynchronous branch refresh without dispatching the old head', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.advanceAt = 99;

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'waiting', reason: 'branch-refresh-pending' }]);
    expect(fixture.wait).toHaveBeenCalledTimes(16);
    expect(writes(fixture.request)).toEqual([
      ['PUT', `${root}/pulls/7/update-branch`, { expected_head_sha: oldHead }],
    ]);
  });

  it('requests read-only CI when the token-triggered PR run requires approval', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.behind = 0;
    fixture.records.advanceAt = 99;
    fixture.records.runs = [
      {
        workflow_id: 101,
        head_sha: oldHead,
        head_branch: fixture.records.pull.head.ref,
        event: 'pull_request',
        repository: fixture.repository,
        head_repository: fixture.repository,
        status: 'completed',
        conclusion: 'action_required',
      },
    ];

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'verification-requested', head: oldHead }]);
    expect(writes(fixture.request)).toEqual([
      [
        'POST',
        `${root}/actions/workflows/ci.yml/dispatches`,
        {
          ref: 'dependabot/npm_and_yarn/frameworks',
          inputs: { expected_head_sha: oldHead },
        },
      ],
    ]);
  });

  it('never selects another repository from an untrusted context', async () => {
    // arrange
    const fixture = controlled();

    // act
    const result = await reconcileDependabotBranches(
      { ...context, repository: 'other/project' },
      fixture,
    );

    // assert
    expect(result).toEqual([]);
    expect(fixture.request).not.toHaveBeenCalled();
  });
  it('ignores a response for a different pull request number', async () => {
    // arrange
    const fixture = controlled();
    fixture.records.pull.number = 8;
    fixture.records.inventory = [{ ...fixture.records.pull, number: 7 }];

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'skipped', reason: 'pull-request-changed' }]);
    expect(writes(fixture.request)).toEqual([]);
  });

  it('returns a bounded blocker instead of failing the remaining dependency inventory', async () => {
    // arrange
    const fixture = controlled();
    const original = fixture.request.getMockImplementation()!;
    fixture.request.mockImplementation((method, endpoint) => {
      if (endpoint.endsWith('/update-branch')) throw new Error('Synthetic private response');
      return original(method, endpoint);
    });

    // act
    const result = await reconcileDependabotBranches(context, fixture);

    // assert
    expect(result).toEqual([{ number: 7, status: 'blocked', reason: 'request-failed' }]);
    expect(fixture.request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });
});
