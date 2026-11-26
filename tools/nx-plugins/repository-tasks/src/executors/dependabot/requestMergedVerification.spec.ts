// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { requestMergedVerification } from './requestMergedVerification.mjs';

// #endregion

const repository = 'pixel-brewery/wortlaut';
const repositoryId = 1444820071;
const repositoryPath = `repos/${repository}`;
const sourceSha = 'a'.repeat(40);
const changedSha = 'b'.repeat(40);
const workflowId = 303;
const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflowId}`;
const mainPath = `${repositoryPath}/branches/main`;
const context = { eventName: 'workflow_run', repository, repositoryId, sourceSha };

function controlled() {
  const identity = { id: repositoryId, full_name: repository };
  const records = {
    repository: { ...identity, default_branch: 'main', private: false, fork: false },
    main: { name: 'main', commit: { sha: sourceSha } },
    workflow: {
      id: workflowId,
      path: '.github/workflows/ci.yml',
      name: 'Desktop quality',
      state: 'active',
    },
    runs: { total_count: 0, workflow_runs: [] },
    run: {
      id: 404,
      workflow_id: workflowId,
      path: '.github/workflows/ci.yml',
      head_sha: sourceSha,
      head_branch: 'main',
      event: 'workflow_dispatch',
      repository: identity,
      head_repository: identity,
      status: 'queued',
      conclusion: null,
    },
  };
  let mainReads = 0;
  const request = vi.fn((method, endpoint) => {
    if (records.failure?.method === method && records.failure?.endpoint === endpoint)
      throw new Error('Sensitive request output must not be exposed.');
    if (method === 'GET' && endpoint === `repositories/${repositoryId}`)
      return structuredClone(records.repository);
    if (method === 'GET' && endpoint === mainPath) {
      mainReads++;
      return structuredClone(mainReads > 1 ? (records.nextMain ?? records.main) : records.main);
    }
    if (method === 'GET' && endpoint === `${repositoryPath}/actions/workflows/ci.yml`)
      return structuredClone(records.workflow);
    if (
      method === 'GET' &&
      endpoint === `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`
    )
      return structuredClone(records.runs);
    if (method === 'POST' && endpoint === `${workflowEndpoint}/dispatches`) {
      if (records.acceptThenFail) {
        records.runs = { total_count: 1, workflow_runs: [records.run] };
        throw new Error('Response was lost after the request was accepted.');
      }
      return undefined;
    }
    throw new Error('Unexpected test request.');
  });
  return { records, request };
}

function writes(request) {
  return request.mock.calls.filter(([method]) => method !== 'GET');
}

describe('Merged source verification request', () => {
  it('requests full CI bound to the exact successful merge source', async () => {
    // arrange
    const dependencies = controlled();

    // act
    const result = await requestMergedVerification(
      { ...context, repositoryId: String(repositoryId) },
      dependencies,
    );

    // assert
    expect(result).toEqual({ status: 'requested', sourceSha });
    expect(writes(dependencies.request)).toEqual([
      [
        'POST',
        `${workflowEndpoint}/dispatches`,
        { ref: 'main', inputs: { expected_head_sha: sourceSha } },
      ],
    ]);
    expect(dependencies.request.mock.calls.at(-2)).toEqual(['GET', mainPath, undefined]);
  });

  it.each([
    { eventName: 'pull_request' },
    { repository: 'foreign/project' },
    { repositoryId: 1 },
    { sourceSha: '' },
    { sourceSha: 'not-a-revision' },
  ])('rejects unsupported request context before reading or writing: %j', async (override) => {
    // arrange
    const dependencies = controlled();

    // act
    const result = requestMergedVerification({ ...context, ...override }, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(dependencies.request).not.toHaveBeenCalled();
  });

  it.each([
    { id: 1 },
    { full_name: 'foreign/project' },
    { private: true },
    { fork: true },
    { default_branch: 'dev' },
  ])('rejects changed immutable repository metadata: %j', async (override) => {
    // arrange
    const dependencies = controlled();
    Object.assign(dependencies.records.repository, override);

    // act
    const result = requestMergedVerification(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each([
    { id: 0 },
    { name: 'Other release' },
    { path: '.github/workflows/ci.yml.lookalike' },
    { state: 'disabled_manually' },
  ])('requires the exact active release workflow: %j', async (override) => {
    // arrange
    const dependencies = controlled();
    Object.assign(dependencies.records.workflow, override);

    // act
    const result = requestMergedVerification(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each(['before-inspection', 'before-dispatch'])(
    'does not verify a superseded merge source: %s',
    async (phase) => {
      // arrange
      const dependencies = controlled();
      const moved = { name: 'main', commit: { sha: changedSha } };
      if (phase === 'before-inspection') dependencies.records.main = moved;
      else dependencies.records.nextMain = moved;

      // act
      const result = await requestMergedVerification(context, dependencies);

      // assert
      expect(result).toEqual({ status: 'superseded', sourceSha });
      expect(writes(dependencies.request)).toEqual([]);
    },
  );

  it.each(['queued', 'success', 'failure', 'cancelled'])(
    'retains an existing verification attempt instead of dispatching again: %s',
    async (outcome) => {
      // arrange
      const dependencies = controlled();
      dependencies.records.run.status = outcome === 'queued' ? 'queued' : 'completed';
      dependencies.records.run.conclusion = outcome === 'queued' ? null : outcome;
      dependencies.records.runs = { total_count: 1, workflow_runs: [dependencies.records.run] };

      // act
      const result = await requestMergedVerification(context, dependencies);

      // assert
      expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
      expect(writes(dependencies.request)).toEqual([]);
    },
  );

  it.each([
    { total_count: -1, workflow_runs: [] },
    { total_count: 0, workflow_runs: null },
    { total_count: 1, workflow_runs: [] },
  ])('fails closed for an incomplete workflow-run listing: %j', async (runs) => {
    // arrange
    const dependencies = controlled();
    dependencies.records.runs = runs;

    // act
    const result = requestMergedVerification(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each([
    { id: 0 },
    { head_sha: changedSha },
    { workflow_id: 304 },
    { event: 'pull_request' },
    { head_branch: 'dev' },
    { repository: {} },
    { head_repository: {} },
  ])('rejects foreign or malformed existing release identities: %j', async (override) => {
    // arrange
    const dependencies = controlled();
    Object.assign(dependencies.records.run, override);
    dependencies.records.runs = { total_count: 1, workflow_runs: [dependencies.records.run] };

    // act
    const result = requestMergedVerification(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it('recovers an ambiguous dispatch response by finding the original accepted run', async () => {
    // arrange
    const dependencies = controlled();
    dependencies.records.acceptThenFail = true;
    await expect(requestMergedVerification(context, dependencies)).rejects.toThrow(
      'Verification request failed',
    );

    // act
    const result = await requestMergedVerification(context, dependencies);

    // assert
    expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
    expect(writes(dependencies.request)).toHaveLength(1);
  });
});
