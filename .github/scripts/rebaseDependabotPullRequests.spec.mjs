// #region Imports
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rebaseDependabotPullRequests } from './rebaseDependabotPullRequests.mjs';
// #endregion

const prefix = 'repos/pixel-brewery/wortlaut';
const mainSha = 'a'.repeat(40);
const context = {
  eventName: 'push',
  ref: 'refs/heads/main',
  repository: 'pixel-brewery/wortlaut',
  repositoryId: 1442982809,
  defaultBranch: 'main',
};

function fixture() {
  const identity = { id: 1442982809, full_name: context.repository };
  const records = {
    repository: {
      ...identity,
      name: 'wortlaut',
      default_branch: 'main',
      fork: false,
      private: false,
      visibility: 'public',
    },
    main: { name: 'main', commit: { sha: mainSha } },
    pull: {
      number: 7,
      state: 'open',
      draft: false,
      merged: false,
      user: { login: 'dependabot[bot]', type: 'Bot' },
      head: { sha: 'b'.repeat(40), repo: identity },
      base: { ref: 'main', sha: mainSha, repo: identity },
    },
    comments: [],
  };
  const calls = [];
  const request = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (method === 'POST' && endpoint === `${prefix}/issues/7/comments`)
      return { id: 123, body: body.body };
    if (endpoint === 'repositories/1442982809') return structuredClone(records.repository);
    if (endpoint === `${prefix}/branches/main`) return structuredClone(records.main);
    if (endpoint === `${prefix}/pulls?state=open&base=main&per_page=100&page=1`)
      return [structuredClone(records.pull)];
    if (endpoint === `${prefix}/pulls/7`) return structuredClone(records.pull);
    if (endpoint.startsWith(`${prefix}/compare/`)) return { behind_by: 1 };
    if (endpoint === `${prefix}/issues/7/comments?per_page=100&page=1`)
      return structuredClone(records.comments);
    throw new Error('Unexpected fixture request.');
  };
  return { records, calls, request };
}

test('requests a bot-owned rebase once for the current main source', async () => {
  const dependencies = fixture();
  const result = await rebaseDependabotPullRequests(context, dependencies);
  assert.deepEqual(result.rebased, [7]);
  const posted = dependencies.calls.find((call) => call.method === 'POST');
  assert.match(posted.body.body, /^@dependabot rebase/u);
  dependencies.records.comments = [
    { user: { login: 'github-actions[bot]', type: 'Bot' }, body: posted.body.body },
  ];
  assert.deepEqual((await rebaseDependabotPullRequests(context, dependencies)).rebased, []);
});

test('does not post rebase commands on foreign branches or human pull requests', async () => {
  const dependencies = fixture();
  assert.equal(
    (await rebaseDependabotPullRequests({ ...context, ref: 'refs/heads/feature' }, dependencies))
      .status,
    'skipped',
  );
  dependencies.records.pull.user.login = 'human';
  assert.deepEqual((await rebaseDependabotPullRequests(context, dependencies)).rebased, []);
  assert.equal(
    dependencies.calls.some((call) => call.method === 'POST'),
    false,
  );
});
