// #region Imports
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestMergedRelease } from './requestMergedRelease.mjs';
// #endregion

const repository = 'pixel-brewery/wortlaut';
const prefix = `repos/${repository}`;
const sourceSha = 'a'.repeat(40);
const context = { eventName: 'workflow_run', repository, repositoryId: 1444820071, sourceSha };

function fixture() {
  const identity = { id: 1444820071, full_name: repository };
  const records = {
    repository: { ...identity, default_branch: 'main', private: false, fork: false },
    main: { name: 'main', commit: { sha: sourceSha } },
    workflow: {
      id: 303,
      name: 'Continuous Desktop Release',
      path: '.github/workflows/release.yml',
      state: 'active',
    },
    runs: { total_count: 0, workflow_runs: [] },
    run: {
      id: 404,
      workflow_id: 303,
      path: '.github/workflows/release.yml',
      head_sha: sourceSha,
      head_branch: 'main',
      event: 'workflow_dispatch',
      repository: identity,
      head_repository: identity,
    },
  };
  const calls = [];
  let mainReads = 0;
  const request = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (method === 'GET' && endpoint === 'repositories/1444820071')
      return structuredClone(records.repository);
    if (method === 'GET' && endpoint === `${prefix}/branches/main`) {
      mainReads++;
      return structuredClone(mainReads > 1 ? (records.nextMain ?? records.main) : records.main);
    }
    if (method === 'GET' && endpoint === `${prefix}/actions/workflows/release.yml`)
      return structuredClone(records.workflow);
    if (
      method === 'GET' &&
      endpoint === `${prefix}/actions/workflows/303/runs?head_sha=${sourceSha}&per_page=100`
    )
      return structuredClone(records.runs);
    if (method === 'POST' && endpoint === `${prefix}/actions/workflows/303/dispatches`) {
      if (records.acceptThenFail) {
        records.runs = { total_count: 1, workflow_runs: [records.run] };
        throw new Error('Response lost after the accepted request.');
      }
      return undefined;
    }
    throw new Error('Unexpected fixture request.');
  };
  return { records, calls, request };
}

test('requests one patch candidate pinned to the retained dependency merge SHA', async () => {
  const dependencies = fixture();
  assert.deepEqual(await requestMergedRelease(context, dependencies), {
    status: 'requested',
    sourceSha,
  });
  assert.deepEqual(
    dependencies.calls.filter((call) => call.method === 'POST'),
    [
      {
        method: 'POST',
        endpoint: `${prefix}/actions/workflows/303/dispatches`,
        body: { ref: 'main', inputs: { specifier: 'patch', source_sha: sourceSha } },
      },
    ],
  );
});

test('retrying an accepted but failed dispatch resumes the original candidate instead of duplicating it', async () => {
  const dependencies = fixture();
  dependencies.records.acceptThenFail = true;
  await assert.rejects(requestMergedRelease(context, dependencies), /Release request failed/u);
  assert.deepEqual(await requestMergedRelease(context, dependencies), {
    status: 'already-requested',
    sourceSha,
    runId: 404,
  });
  assert.equal(dependencies.calls.filter((call) => call.method === 'POST').length, 1);
});

test('does not dispatch after a newer main source supersedes the merge', async () => {
  const dependencies = fixture();
  dependencies.records.nextMain = { name: 'main', commit: { sha: 'b'.repeat(40) } };
  assert.deepEqual(await requestMergedRelease(context, dependencies), {
    status: 'superseded',
    sourceSha,
  });
  assert.equal(
    dependencies.calls.some((call) => call.method === 'POST'),
    false,
  );
});

test('rejects private repositories, wrong workflows and foreign source identities', async () => {
  for (const kind of ['private', 'wrong-workflow', 'wrong-context']) {
    const dependencies = fixture();
    if (kind === 'private') dependencies.records.repository.private = true;
    if (kind === 'wrong-workflow') dependencies.records.workflow.name = 'Other workflow';
    await assert.rejects(
      requestMergedRelease(
        kind === 'wrong-context' ? { ...context, repositoryId: 1 } : context,
        dependencies,
      ),
    );
    assert.equal(
      dependencies.calls.some((call) => call.method === 'POST'),
      false,
    );
  }
});
