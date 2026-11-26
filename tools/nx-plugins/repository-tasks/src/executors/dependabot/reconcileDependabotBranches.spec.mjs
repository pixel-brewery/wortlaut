// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import { reconcileDependabotBranches } from './reconcileDependabotBranches.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const root = 'repos/pixel-brewery/wortlaut';
const main = 'a'.repeat(40);
const oldHead = 'b'.repeat(40);
const newHead = 'c'.repeat(40);
const testMerge = 'e'.repeat(40);
const tree = 'f'.repeat(40);
const squash = '9'.repeat(40);
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const ciBlob = {
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(ci).toString('base64'),
    sha: createHash('sha1')
        .update(`blob ${Buffer.byteLength(ci)}\0`)
        .update(ci)
        .digest('hex')
};
const context = {
    eventName: 'schedule',
    repository: 'pixel-brewery/wortlaut',
    repositoryId: 1444820071,
    defaultBranch: 'main'
};

function controlled() {
    const repository = {
        id: 1444820071,
        name: 'wortlaut',
        full_name: 'pixel-brewery/wortlaut',
        default_branch: 'main',
        fork: false,
        private: false,
        visibility: 'public'
    };
    const pull = {
        number: 7,
        state: 'open',
        draft: false,
        merged: false,
        user: { id: 49699333,
            login: 'dependabot[bot]',
            type: 'Bot' },
        mergeable: true,
        merge_commit_sha: testMerge,
        head: { sha: oldHead,
            ref: 'dependabot/npm_and_yarn/frameworks',
            repo: repository },
        base: { ref: 'main',
            sha: main,
            repo: repository }
    };
    const records = {
        pull,
        inventory: [pull],
        behind: 1,
        advanceAt: 2,
        changedAt: 99,
        runs: []
    };
    let reads = 0;
    let merged = false;
    const currentHead = () => reads >= records.changedAt ? 'd'.repeat(40) : reads >= records.advanceAt ? newHead : oldHead;
    const currentPull = () => ({
        ...structuredClone(records.pull),
        head: { ...structuredClone(records.pull.head),
            sha: currentHead() }
    });
    const nativeRun = (run) => ({
        id: 202,
        run_attempt: 2,
        workflow_id: 101,
        name: 'Desktop quality',
        path: '.github/workflows/ci.yml',
        head_sha: currentHead(),
        head_branch: records.pull.head.ref,
        actor: { id: 41898282,
            login: 'github-actions[bot]',
            type: 'Bot' },
        triggering_actor: { id: 41898282,
            login: 'github-actions[bot]',
            type: 'Bot' },
        repository,
        head_repository: repository,
        pull_requests: [{ number: 7,
            head: currentPull().head,
            base: records.pull.base }],
        ...run
    });
    const request = ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))(
        (method, endpoint) => {
            if (endpoint === 'repositories/1444820071') return structuredClone(repository);
            if (endpoint === `${root}/actions/workflows/ci.yml`) return {
                id: 101,
                name: 'Desktop quality',
                state: 'active',
                path: '.github/workflows/ci.yml'
            };
            if (endpoint === `${root}/pulls?state=open&base=main&per_page=100&page=1`) return structuredClone(records.inventory);
            if (endpoint === `${root}/pulls/7`) {
                reads++;
                if (merged) return { ...currentPull(),
                    state: 'closed',
                    merged: true,
                    merge_commit_sha: squash };
                return {
                    ...structuredClone(records.pull),
                    head: {
                        ...structuredClone(records.pull.head),
                        sha:
              reads >= records.changedAt
                  ? 'd'.repeat(40)
                  : reads >= records.advanceAt
                      ? newHead
                      : oldHead
                    }
                };
            }
            if (endpoint === `${root}/branches/main`) return { name: 'main',
                commit: { sha: main } };
            if (endpoint.startsWith(`${root}/compare/`)) return {
                behind_by: endpoint.endsWith(newHead) ? 0 : records.behind,
                merge_base_commit: { sha: main }
            };
            if (endpoint.endsWith('/update-branch') && method === 'PUT') return { message: 'Updating' };
            if (endpoint.includes('/actions/workflows/ci.yml/runs?')) return { total_count: records.runs.length,
                workflow_runs: records.runs.map(nativeRun) };
            if (endpoint === `${root}/actions/runs/202`) return nativeRun(records.runs[0]);
            if (endpoint === `${root}/git/ref/heads/${records.pull.head.ref}`) return { object: { type: 'commit',
                sha: currentHead() } };
            if (endpoint === `${root}/git/ref/pull/7/merge`) return { object: { type: 'commit',
                sha: testMerge } };
            if (
                endpoint === `${root}/git/commits/${oldHead}` ||
                endpoint === `${root}/git/commits/${newHead}`
            ) return { sha: currentHead(),
                tree: { sha: tree } };
            if (endpoint === `${root}/git/commits/${testMerge}`) return {
                sha: testMerge,
                tree: { sha: tree },
                parents: [{ sha: main }, { sha: currentHead() }]
            };
            if (endpoint.startsWith(`${root}/contents/.github/workflows/ci.yml?ref=`)) return ciBlob;
            if (endpoint.includes('/commits/') && endpoint.endsWith('/pulls?per_page=100')) return [{ ...currentPull(),
                merged: undefined,
                merged_at: null }];
            if (endpoint === `${root}/rules/branches/main`) return [
                { type: 'pull_request' },
                {
                    type: 'required_status_checks',
                    parameters: {
                        strict_required_status_checks_policy: true,
                        required_status_checks: verificationPolicy.requiredChecks.map((context) => ({
                            context,
                            integration_id: 15368
                        }))
                    }
                }
            ];
            if (endpoint.endsWith('/attempts/2/jobs?per_page=100&page=1')) return {
                total_count: verificationPolicy.requiredJobs.length,
                jobs: verificationPolicy.requiredJobs.map((name, id) => ({
                    id: id + 1,
                    name,
                    head_sha: currentHead(),
                    run_id: 202,
                    run_attempt: 2,
                    status: 'completed',
                    conclusion: 'success'
                }))
            };
            if (method === 'PUT' && endpoint === `${root}/pulls/7/merge`) {
                merged = true;
                return { merged: true,
                    sha: squash };
            }
            if (method === 'POST' && endpoint === `${root}/actions/runs/202/approve`) return undefined;
            if (endpoint.endsWith('/dispatches') && method === 'POST') return undefined;
            throw new Error('Unexpected test request.');
        }
    );
    return {
        records,
        repository,
        request,
        wait: ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))(
            async() => undefined
        )
    };
}

function writes(request) {
    return request.mock.calls.map((call) => call.arguments).filter(([method]) => method !== 'GET');
}

describe('Dependabot branch reconciliation', () => {
    it('updates only the expected stale head and waits for its native CI', async() => {
    // arrange
        const fixture = controlled();

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [
            { number: 7,
                status: 'waiting',
                reason: 'native-ci-not-observed',
                head: newHead }
        ]);
        assert.deepEqual(writes(fixture.request), [
            ['PUT', `${root}/pulls/7/update-branch`, { expected_head_sha: oldHead }]
        ]);
    });

    it('does not touch a contributor pull request', async() => {
    // arrange
        const fixture = controlled();
        fixture.records.pull.user = { login: 'contributor',
            type: 'User' };

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, []);
        assert.deepEqual(writes(fixture.request), []);
    });

    it('does not restart a failed verification of a current branch', async() => {
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
                conclusion: 'failure'
            }
        ];

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [
            { number: 7,
                status: 'waiting',
                reason: 'verification-already-requested' }
        ]);
        assert.deepEqual(writes(fixture.request), []);
    });

    it('bounds an asynchronous branch refresh without dispatching the old head', async() => {
    // arrange
        const fixture = controlled();
        fixture.records.advanceAt = 99;

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [{ number: 7,
            status: 'waiting',
            reason: 'branch-refresh-pending' }]);
        assert.equal(fixture.wait.mock.callCount(), 16);
        assert.deepEqual(writes(fixture.request), [
            ['PUT', `${root}/pulls/7/update-branch`, { expected_head_sha: oldHead }]
        ]);
    });

    it('reports approval-required without performing an Actions write in the branch mutator', async() => {
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
                conclusion: 'action_required'
            }
        ];

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [
            { number: 7,
                status: 'approval-required',
                head: oldHead,
                runId: 202,
                runAttempt: 2 }
        ]);
        assert.deepEqual(writes(fixture.request), []);
    });

    it('resumes a successful ordinary PR through the full strict merger', async() => {
    // Arrange
        const fixture = controlled();
        fixture.records.behind = 0;
        fixture.records.advanceAt = 99;
        fixture.records.runs = [{ event: 'pull_request',
            status: 'completed',
            conclusion: 'success' }];
        // Act
        const result = await reconcileDependabotBranches(context, fixture);
        // Assert
        assert.deepEqual(result, [{ number: 7,
            status: 'merged',
            sha: squash,
            head: oldHead }]);
        assert.deepEqual(writes(fixture.request), [
            ['PUT', `${root}/pulls/7/merge`, { sha: oldHead,
                merge_method: 'squash' }]
        ]);
    });

    it('never selects another repository from an untrusted context', async() => {
    // arrange
        const fixture = controlled();

        // act
        const result = await reconcileDependabotBranches(
            { ...context,
                repository: 'other/project' },
            fixture
        );

        // assert
        assert.deepEqual(result, []);
        assert.equal(fixture.request.mock.callCount() === 0, true);
    });
    it('ignores a response for a different pull request number', async() => {
    // arrange
        const fixture = controlled();
        fixture.records.pull.number = 8;
        fixture.records.inventory = [{ ...fixture.records.pull,
            number: 7 }];

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [{ number: 7,
            status: 'skipped',
            reason: 'pull-request-changed' }]);
        assert.deepEqual(writes(fixture.request), []);
    });

    it('returns a bounded blocker instead of failing the remaining dependency inventory', async() => {
    // arrange
        const fixture = controlled();
        const original = fixture.request.originalImplementation;
        fixture.request.mock.mockImplementation((method, endpoint) => {
            if (endpoint.endsWith('/update-branch')) throw new Error('Synthetic private response');
            return original(method, endpoint);
        });

        // act
        const result = await reconcileDependabotBranches(context, fixture);

        // assert
        assert.deepEqual(result, [{ number: 7,
            status: 'blocked',
            reason: 'request-failed' }]);
        assert.equal(
            fixture.request.mock.calls
                .map((call) => call.arguments)
                .some(([method]) => method === 'POST'),
            false
        );
    });
});
