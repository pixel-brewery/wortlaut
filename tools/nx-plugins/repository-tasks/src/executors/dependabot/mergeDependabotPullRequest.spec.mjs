// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it, mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { mergeDependabotPullRequest } from './mergeDependabotPullRequest.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const repositoryId = 1444820071;
const repositoryPath = 'repos/pixel-brewery/wortlaut';
const mainSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const changedSha = 'd'.repeat(40);
const testMergeSha = 'e'.repeat(40);
const treeSha = 'f'.repeat(40);
const branch = 'dependabot/npm_and_yarn/frameworks';
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
    eventName: 'workflow_run',
    repository: 'pixel-brewery/wortlaut',
    repositoryId: repositoryId,
    defaultBranch: 'main',
    runId: 202,
    runAttempt: 2
};
const jobsPath = `${repositoryPath}/actions/runs/202/attempts/2/jobs?per_page=100&page=`;
const pullRequestPath = `${repositoryPath}/pulls/7`;
const runPath = `${repositoryPath}/actions/runs/202`;
const mainPath = `${repositoryPath}/branches/main`;

function controlled() {
    const repository = { id: repositoryId,
        full_name: 'pixel-brewery/wortlaut' };
    const jobs = verificationPolicy.requiredJobs.map((name, index) => ({
        id: index + 1,
        run_id: 202,
        run_attempt: 2,
        head_sha: headSha,
        name,
        status: 'completed',
        conclusion: 'success'
    }));
    const records = {
        workflow: {
            id: 101,
            name: 'Desktop quality',
            path: '.github/workflows/ci.yml',
            state: 'active'
        },
        run: {
            id: 202,
            run_attempt: 2,
            event: 'pull_request',
            status: 'completed',
            conclusion: 'success',
            workflow_id: 101,
            name: 'Desktop quality',
            path: '.github/workflows/ci.yml',
            repository,
            head_repository: repository,
            head_sha: headSha,
            head_branch: branch,
            actor: { id: 49699333,
                login: 'dependabot[bot]',
                type: 'Bot' },
            triggering_actor: { id: 49699333,
                login: 'dependabot[bot]',
                type: 'Bot' },
            pull_requests: [
                {
                    number: 7,
                    head: { ref: branch,
                        sha: headSha,
                        repo: repository },
                    base: { ref: 'main',
                        sha: mainSha,
                        repo: repository }
                }
            ]
        },
        pullRequest: {
            number: 7,
            state: 'open',
            draft: false,
            merged: false,
            user: { id: 49699333,
                login: 'dependabot[bot]',
                type: 'Bot' },
            mergeable: true,
            merge_commit_sha: testMergeSha,
            head: { sha: headSha,
                ref: branch,
                repo: repository },
            base: { ref: 'main',
                sha: mainSha,
                repo: repository }
        },
        main: { name: 'main',
            commit: { sha: mainSha } },
        comparison: { behind_by: 0,
            merge_base_commit: { sha: mainSha } },
        jobs,
        jobPages: [{ total_count: jobs.length,
            jobs }],
        merge: { merged: true,
            sha: mergeSha }
    };
    const reads = new Map();
    let merged = false;
    const request = ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))(
        (method, endpoint) => {
            if (records.failure?.method === method && records.failure?.endpoint === endpoint) throw new Error('Sensitive upstream output must not reach the caller.');

            if (method === 'PUT' && endpoint === `${pullRequestPath}/merge`) {
                merged = records.merge.merged === true;
                return structuredClone(records.merge);
            }

            if (method !== 'GET') throw new Error('Unexpected test request.');

            const count = (reads.get(endpoint) ?? 0) + 1;

            reads.set(endpoint, count);

            if (endpoint === `repositories/${repositoryId}`) return {
                ...repository,
                name: 'wortlaut',
                default_branch: 'main',
                fork: false,
                visibility: 'public',
                private: false
            };

            if (endpoint === `${repositoryPath}/actions/workflows/ci.yml`) return structuredClone(records.workflow);

            if (endpoint === runPath) return structuredClone(count > 1 ? records.nextRun ?? records.run : records.run);

            if (endpoint === pullRequestPath) return merged
                ? {
                    ...structuredClone(records.pullRequest),
                    state: 'closed',
                    merged: true,
                    merge_commit_sha: records.merge.sha
                }
                : structuredClone(
                    count > 1 ? records.nextPullRequest ?? records.pullRequest : records.pullRequest
                );

            if (
                endpoint ===
                `${repositoryPath}/actions/workflows/ci.yml/runs?head_sha=${headSha}&per_page=100`
            ) {
                const runs = [
                    structuredClone(records.inventoryRun ?? records.run),
                    ...records.extraRuns ?? []
                ];
                return { total_count: runs.length,
                    workflow_runs: runs };
            }
            if (endpoint === `${repositoryPath}/git/ref/heads/${branch}`) return { object: { type: 'commit',
                sha: headSha } };
            if (endpoint === `${repositoryPath}/git/ref/pull/7/merge`) return { object: { type: 'commit',
                sha: testMergeSha } };
            if (endpoint === `${repositoryPath}/git/commits/${headSha}`) return { sha: headSha,
                tree: { sha: treeSha } };
            if (endpoint === `${repositoryPath}/git/commits/${testMergeSha}`) return {
                sha: testMergeSha,
                tree: { sha: treeSha },
                parents: [{ sha: mainSha }, { sha: headSha }]
            };
            if (
                endpoint === `${repositoryPath}/contents/.github/workflows/ci.yml?ref=${mainSha}` ||
                endpoint === `${repositoryPath}/contents/.github/workflows/ci.yml?ref=${headSha}`
            ) return ciBlob;
            if (endpoint === `${repositoryPath}/commits/${headSha}/pulls?per_page=100`) return [{ ...structuredClone(records.pullRequest),
                merged: undefined,
                merged_at: null }];
            if (endpoint === `${repositoryPath}/rules/branches/main`) return [
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

            if (endpoint === mainPath) return structuredClone(count > 1 ? records.nextMain ?? records.main : records.main);

            if (endpoint === `${repositoryPath}/compare/${mainSha}...${headSha}`) return structuredClone(records.comparison);

            if (endpoint.startsWith(jobsPath)) return structuredClone(records.jobPages[Number(endpoint.slice(jobsPath.length)) - 1]);

            throw new Error('Unexpected test endpoint.');
        }
    );

    return { records,
        request };
}

function writes(request) {
    return request.mock.calls.map((call) => call.arguments).filter(([method]) => method !== 'GET');
}

afterEach(() => {
    mock.restoreAll();
    void 0;
});

describe('Dependabot pull request merge', () => {
    for (const actor of [
        { id: 41898282,
            login: 'github-actions[bot]',
            type: 'Bot' },
        { id: 7523247,
            login: 'RueDeRennes',
            type: 'User' }
    ]) {
        it('accepts a fully verified actual PR run from ' + JSON.stringify(actor) + '', async() => {
            // Arrange
            const fixture = controlled();
            fixture.records.run.actor = actor;
            fixture.records.run.triggering_actor = actor;
            // Act
            const result = await mergeDependabotPullRequest(context, fixture);
            // Assert
            assert.equal(result.status, 'merged');
            assert.equal(writes(fixture.request).length, 1);
        });
    }
    it('retains the real native run when a newer diagnostic exists', async() => {
    // Arrange
        const fixture = controlled();
        fixture.records.extraRuns = [
            { ...fixture.records.run,
                id: 203,
                event: 'workflow_dispatch',
                pull_requests: [] }
        ];
        // Act
        const result = await mergeDependabotPullRequest(context, fixture);
        // Assert
        assert.equal(result.status, 'merged');
        assert.equal(writes(fixture.request).length, 1);
    });
    it('blocks an older successful PR run behind a newer native failure', async() => {
    // Arrange
        const fixture = controlled();
        fixture.records.extraRuns = [{ ...fixture.records.run,
            id: 203,
            conclusion: 'failure' }];
        // Act
        const result = await mergeDependabotPullRequest(context, fixture);
        // Assert
        assert.equal(result.status, 'skipped');
        assert.deepEqual(writes(fixture.request), []);
    });
    it('loads the actual current attempt when the inventory still lists the previous attempt', async() => {
    // Arrange
        const fixture = controlled();
        fixture.records.inventoryRun = { ...fixture.records.run,
            run_attempt: 1 };
        // Act
        const result = await mergeDependabotPullRequest(context, fixture);
        // Assert
        assert.equal(result.status, 'merged');
        assert.equal(writes(fixture.request).length, 1);
    });

    for (const title of [
        'Bump vitest from 4.0.0 to 5.0.0',
        'Bump typescript-eslint from 8.0.0 to 8.1.0',
        'Bump a dependency from 1.0.0 to 1.0.1'
    ]) {
        it('merges an eligible update once at its tested SHA: ' + title + '', async() => {
            // Arrange
            const dependencies = controlled();

            dependencies.records.pullRequest.title = title;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            assert.deepEqual(result, {
                status: 'merged',
                pullRequestNumber: 7,
                sha: mergeSha,
                defaultBranch: 'main'
            });
            assert.deepEqual(writes(dependencies.request), [
                ['PUT', `${pullRequestPath}/merge`, { sha: headSha,
                    merge_method: 'squash' }]
            ]);
            assert.deepEqual(dependencies.request.mock.calls.map((call) => call.arguments).at(-1), [
                'GET',
                pullRequestPath,
                undefined
            ]);
            assert.ok(
                dependencies.request.mock.calls
                    .map((call) => call.arguments)
                    .filter(([, endpoint]) => endpoint === runPath).length >= 2
            );
            assert.equal(
                dependencies.request.mock.calls.some((call) => isDeepStrictEqual(call.arguments, ['GET', `${jobsPath}1`, undefined])),
                true
            );
        });
    }

    it('accepts the documented workflow path with a ref suffix while retaining canonical workflow identity', async() => {
    // Arrange
        const dependencies = controlled();

        dependencies.records.run.path = '.github/workflows/ci.yml@refs/pull/7/merge';

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        assert.equal(result.status, 'merged');
        assert.equal(writes(dependencies.request).length, 1);
    });

    for (const override of [
        { eventName: 'pull_request' },
        { eventName: 'workflow_dispatch' },
        { runId: undefined },
        { runId: '202/traversal' },
        { runId: Number.MAX_SAFE_INTEGER + 1 },
        { runAttempt: 0 },
        { runAttempt: '2.5' }
    ]) {
        it(
            'rejects unsupported trigger metadata before any API request: ' +
            JSON.stringify(override) +
            '',
            async() => {
                // Arrange
                const dependencies = controlled();

                // Act
                const result = await mergeDependabotPullRequest({ ...context,
                    ...override }, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'unsupported-context' });
                assert.equal(dependencies.request.mock.callCount() === 0, true);
            }
        );
    }

    for (const override of [
        { id: undefined },
        { name: 'Other workflow' },
        { path: '.github/workflows/ci.yml.lookalike' }
    ]) {
        it('rejects a different canonical workflow: ' + JSON.stringify(override) + '', async() => {
            // Arrange
            const dependencies = controlled();

            Object.assign(dependencies.records.workflow, override);

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            assert.deepEqual(result, { status: 'skipped',
                reason: 'unexpected-workflow' });
            assert.deepEqual(writes(dependencies.request), []);
        });
    }

    for (const override of [
        { id: 203 },
        { run_attempt: 1 },
        { run_attempt: 3 },
        { event: 'push' },
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { conclusion: 'skipped' },
        { workflow_id: 102 },
        { name: 'Other workflow' },
        { path: '.github/workflows/other.yml' },
        { path: '.github/workflows/ci.yml.lookalike@main' },
        { path: '.github/workflows/ci.yml@' },
        { repository: { full_name: 'untrusted/wortlaut' } },
        { head_repository: { full_name: 'untrusted/wortlaut' } },
        { head_repository: null },
        { head_sha: 'untrusted/branch' }
    ]) {
        it(
            'rejects an ineligible or superseded workflow run: ' + JSON.stringify(override) + '',
            async() => {
                // Arrange
                const dependencies = controlled();

                Object.assign(dependencies.records.run, override);

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'ineligible-workflow-run' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    for (const [pullRequests] of [
        [undefined],
        [[]],
        [[{ number: 7 }, { number: 8 }]],
        [[{ number: 0 }]],
        [[null]]
    ]) {
        it(
            'requires exactly one valid associated pull request: ' + JSON.stringify(pullRequests) + '',
            async() => {
                // Arrange
                const dependencies = controlled();

                dependencies.records.run.pull_requests = pullRequests;

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'ambiguous-pull-request' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    for (const override of [
        { number: 8 },
        { state: 'closed' },
        { draft: true },
        { merged: true },
        { user: { login: 'contributor',
            type: 'User' } },
        { user: { login: 'dependabot',
            type: 'Bot' } },
        { user: { login: 'dependabot[bot]',
            type: 'User' } },
        { head: { sha: headSha,
            repo: { full_name: 'untrusted/wortlaut' } } },
        { head: { sha: changedSha,
            repo: { full_name: 'pixel-brewery/wortlaut' } } },
        { base: { ref: 'main',
            sha: mainSha,
            repo: { full_name: 'untrusted/wortlaut' } } },
        {
            base: {
                ref: 'other',
                sha: mainSha,
                repo: { full_name: 'pixel-brewery/wortlaut' }
            }
        },
        {
            base: {
                ref: 'main',
                sha: 'unknown',
                repo: { full_name: 'pixel-brewery/wortlaut' }
            }
        }
    ]) {
        it(
            'rejects a pull request outside the Dependabot identity and tested-head gates: ' +
            JSON.stringify(override) +
            '',
            async() => {
                // Arrange
                const dependencies = controlled();

                Object.assign(dependencies.records.pullRequest, override);

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'ineligible-pull-request' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    for (const override of [
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { conclusion: 'skipped' },
        { conclusion: 'neutral' },
        { conclusion: 'cancelled' },
        { name: 'untrusted job' },
        { run_id: 203 },
        { run_attempt: 1 },
        { id: 2 }
    ]) {
        it(
            'requires each current-attempt matrix job to succeed exactly once: ' +
            JSON.stringify(override) +
            '',
            async() => {
                // Arrange
                const dependencies = controlled();

                Object.assign(dependencies.records.jobs[0], override);

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'incomplete-verification' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    for (const conclusion of ['failure', 'cancelled', 'skipped']) {
        it(
            'rejects a ' + conclusion + ' aggregate gate even when the workflow reports success',
            async() => {
                // Arrange
                const dependencies = controlled();

                dependencies.records.jobs[dependencies.records.jobs.length - 1].conclusion = conclusion;

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'incomplete-verification' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    for (const kind of ['missing', 'duplicate', 'extra']) {
        it('rejects ' + kind + ' matrix coverage', async() => {
            // Arrange
            const dependencies = controlled();
            const jobs = dependencies.records.jobs;

            if (kind === 'missing') jobs.pop();
            else if (kind === 'duplicate') jobs[jobs.length - 1] = { ...jobs[0],
                id: jobs.length + 1 };
            else jobs.push({ ...jobs[0],
                id: 5,
                name: 'extra job' });

            dependencies.records.jobPages[0].total_count = jobs.length;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            assert.deepEqual(result, { status: 'skipped',
                reason: 'incomplete-verification' });
            assert.deepEqual(writes(dependencies.request), []);
        });
    }

    it('reads every job page from the triggering attempt before merging', async() => {
    // Arrange
        const dependencies = controlled();

        dependencies.records.jobPages = [
            {
                total_count: verificationPolicy.requiredJobs.length,
                jobs: dependencies.records.jobs.slice(0, 1)
            },
            {
                total_count: verificationPolicy.requiredJobs.length,
                jobs: dependencies.records.jobs.slice(1)
            }
        ];

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        assert.equal(result.status, 'merged');
        assert.deepEqual(
            dependencies.request.mock.calls
                .map((call) => call.arguments)
                .filter(([, endpoint]) => endpoint.includes('/jobs?')),
            [
                ['GET', `${jobsPath}1`, undefined],
                ['GET', `${jobsPath}2`, undefined]
            ]
        );
    });

    for (const kind of ['count-changed', 'empty-page', 'too-many', 'invalid-shape']) {
        it('fails closed when job pagination is incomplete or inconsistent: ' + kind + '', async() => {
            // Arrange
            const dependencies = controlled();
            const jobs = dependencies.records.jobs;

            dependencies.records.jobPages = [
                { total_count: verificationPolicy.requiredJobs.length,
                    jobs: jobs.slice(0, 1) },
                {
                    total_count: verificationPolicy.requiredJobs.length + (kind === 'count-changed' ? 1 : 0),
                    jobs: jobs.slice(1)
                }
            ];

            if (kind === 'empty-page') dependencies.records.jobPages[1].jobs = [];
            else if (kind === 'too-many') dependencies.records.jobPages[0].total_count = 1_001;
            else if (kind === 'invalid-shape') dependencies.records.jobPages[0].jobs = null;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            assert.deepEqual(result, { status: 'skipped',
                reason: 'incomplete-verification' });
            assert.deepEqual(writes(dependencies.request), []);
        });
    }

    for (const override of [
        { behind_by: 1 },
        { merge_base_commit: { sha: changedSha } },
        { merge_base_commit: null }
    ]) {
        it(
            'requires current main to be an ancestor of the tested head: ' +
            JSON.stringify(override) +
            '',
            async() => {
                // Arrange
                const dependencies = controlled();

                Object.assign(dependencies.records.comparison, override);

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'branch-not-current' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    it('rejects malformed main metadata without constructing an untrusted compare endpoint', async() => {
    // Arrange
        const dependencies = controlled();

        dependencies.records.main.commit.sha = 'untrusted/branch';

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        assert.deepEqual(result, { status: 'skipped',
            reason: 'invalid-main' });
        assert.equal(
            dependencies.request.mock.calls
                .map((call) => call.arguments)
                .some(([, endpoint]) => endpoint.includes('/compare/')),
            false
        );
        assert.deepEqual(writes(dependencies.request), []);
    });

    for (const kind of ['head', 'base', 'author', 'closed']) {
        it('rejects a changed pull request before the final write: ' + kind + '', async() => {
            // Arrange
            const dependencies = controlled();
            const next = structuredClone(dependencies.records.pullRequest);

            if (kind === 'head') next.head.sha = changedSha;
            else if (kind === 'base') next.base.sha = changedSha;
            else if (kind === 'author') next.user = { login: 'contributor',
                type: 'User' };
            else next.state = 'closed';

            dependencies.records.nextPullRequest = next;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            assert.deepEqual(result, { status: 'skipped',
                reason: 'pull-request-or-main-changed' });
            assert.deepEqual(writes(dependencies.request), []);
        });
    }

    for (const override of [
        { run_attempt: 3 },
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { head_sha: changedSha },
        { pull_requests: [{ number: 8 }] }
    ]) {
        it(
            'rejects a retried or changed run immediately before merging: ' +
            JSON.stringify(override) +
            '',
            async() => {
                // Arrange
                const dependencies = controlled();

                dependencies.records.nextRun = { ...dependencies.records.run,
                    ...override };

                // Act
                const result = await mergeDependabotPullRequest(context, dependencies);

                // Assert
                assert.deepEqual(result, { status: 'skipped',
                    reason: 'workflow-run-changed' });
                assert.deepEqual(writes(dependencies.request), []);
            }
        );
    }

    it('rejects main moving after the ancestry check', async() => {
    // Arrange
        const dependencies = controlled();

        dependencies.records.nextMain = { commit: { sha: changedSha } };

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        assert.deepEqual(result, { status: 'skipped',
            reason: 'unproven-readonly-source' });
        assert.deepEqual(writes(dependencies.request), []);
    });

    for (const [method, endpoint] of [
        ['GET', `${jobsPath}1`],
        ['PUT', `${pullRequestPath}/merge`]
    ]) {
        it(
            'stops on a rejected API request without leaking its diagnostic or retrying: ' + method + '',
            async() => {
                // Arrange
                const dependencies = controlled();

                dependencies.records.failure = { method,
                    endpoint };

                // Act
                const result = mergeDependabotPullRequest(context, dependencies);

                // Assert
                await assert.rejects(
                    result,
                    (error) => error instanceof Error &&
                      error.message.includes('Dependabot merge stopped after a GitHub API request failed;')
                );
                await assert.rejects(
                    result,
                    (error) => error instanceof Error && !error.message.includes('Sensitive upstream output')
                );
                assert.equal(
                    dependencies.request.mock.calls
                        .map((call) => call.arguments)
                        .filter(
                            ([calledMethod, calledEndpoint]) => calledMethod === method && calledEndpoint === endpoint
                        ).length,
                    1
                );
                assert.equal(writes(dependencies.request).length, method === 'PUT' ? 1 : 0);
            }
        );
    }

    it('requires an explicit merge confirmation without retrying or exposing the API message', async() => {
    // Arrange
        const dependencies = controlled();

        dependencies.records.merge = {
            merged: false,
            message: 'Sensitive merge diagnostic must not reach the caller.'
        };

        // Act
        const result = mergeDependabotPullRequest(context, dependencies);

        // Assert
        await assert.rejects(
            result,
            (error) => error instanceof Error && error.message.includes('GitHub did not confirm')
        );
        await assert.rejects(
            result,
            (error) => error instanceof Error && !error.message.includes('Sensitive merge diagnostic')
        );
        assert.equal(writes(dependencies.request).length, 1);
    });
});

describe('Dependabot refreshed-head verification', () => {
    it('rejects diagnostic CI even for the uniquely associated current Dependabot head', async() => {
    // arrange
        const { records, request } = controlled();
        records.run.event = 'workflow_dispatch';
        records.run.pull_requests = [];
        Object.assign(records.run, { head_branch: 'dependabot/npm_and_yarn/frameworks' });
        Object.assign(records.pullRequest.head, { ref: 'dependabot/npm_and_yarn/frameworks' });
        const original = request.originalImplementation;
        request.mock.mockImplementation((method, endpoint) => endpoint === `${repositoryPath}/commits/${headSha}/pulls?per_page=100`
            ? [{ ...structuredClone(records.pullRequest),
                merged: undefined,
                merged_at: null }]
            : original(method, endpoint));

        // act
        const result = await mergeDependabotPullRequest(context, { request });

        // assert
        assert.deepEqual(result, { status: 'skipped',
            reason: 'ineligible-workflow-run' });
        assert.deepEqual(writes(request), []);
    });

    it('rejects ambiguous dispatched-head associations without a merge', async() => {
    // arrange
        const { records, request } = controlled();
        records.run.event = 'workflow_dispatch';
        records.run.pull_requests = [];
        Object.assign(records.run, { head_branch: 'dependabot/npm_and_yarn/frameworks' });
        Object.assign(records.pullRequest.head, { ref: 'dependabot/npm_and_yarn/frameworks' });
        const original = request.originalImplementation;
        request.mock.mockImplementation((method, endpoint) => endpoint === `${repositoryPath}/commits/${headSha}/pulls?per_page=100`
            ? [
                { ...structuredClone(records.pullRequest),
                    merged: undefined,
                    merged_at: null },
                {
                    ...structuredClone(records.pullRequest),
                    number: 8,
                    merged: undefined,
                    merged_at: null
                }
            ]
            : original(method, endpoint));

        // act
        const result = await mergeDependabotPullRequest(context, { request });

        // assert
        assert.deepEqual(result, { status: 'skipped',
            reason: 'ineligible-workflow-run' });
        assert.deepEqual(writes(request), []);
    });

    it('rejects a manually verified non-Dependabot branch without a merge', async() => {
    // arrange
        const { records, request } = controlled();
        records.run.event = 'workflow_dispatch';
        records.run.pull_requests = [];
        Object.assign(records.run, { head_branch: 'feature/manual' });

        // act
        const result = await mergeDependabotPullRequest(context, { request });

        // assert
        assert.deepEqual(result, { status: 'skipped',
            reason: 'ineligible-workflow-run' });
        assert.deepEqual(writes(request), []);
    });
});

for (const scenario of [
    'same open head is behind',
    'main did not advance',
    'pull request closed',
    'pull request head changed',
    'head still includes main',
    'request was forbidden'
]) {
    it(`retains the existing declined-merge base-race guard: ${scenario}`, async() => {
    // Arrange
        const fixture = controlled();
        const advanced = '0'.repeat(40);
        const original = fixture.request.originalImplementation;
        fixture.request.mock.mockImplementation((method, endpoint, body) => {
            if (method === 'PUT' && endpoint === `${pullRequestPath}/merge`) {
                if (scenario !== 'main did not advance') fixture.records.nextMain = { name: 'main',
                    commit: { sha: advanced } };
                if (scenario === 'pull request closed') fixture.records.pullRequest.state = 'closed';
                if (scenario === 'pull request head changed') fixture.records.pullRequest.head.sha = mergeSha;
                throw Object.assign(new Error('Synthetic declined merge'), {
                    status: scenario === 'request was forbidden' ? 403 : 405
                });
            }
            if (endpoint === `${repositoryPath}/compare/${advanced}...${headSha}`) return scenario === 'head still includes main'
                ? { behind_by: 0,
                    merge_base_commit: { sha: advanced } }
                : { behind_by: 1,
                    merge_base_commit: { sha: mainSha } };
            return original(method, endpoint, body);
        });
        // Act
        const result = mergeDependabotPullRequest(context, fixture);
        // Assert
        if (scenario === 'same open head is behind') assert.deepEqual(await result, { status: 'skipped',
            reason: 'main-changed' });
        else await assert.rejects(result, /Dependabot merge stopped after a GitHub API request failed/u);
        assert.equal(writes(fixture.request).length, 1);
    });
}

describe('Latest eligible native association', () => {
    for (const difference of ['another PR', 'another base branch', 'another base revision']) {
        it(
            'does not shadow the verified own PR with a newer native run for ' + difference + '',
            async() => {
                // Arrange
                const fixture = controlled();
                const unrelated = structuredClone(fixture.records.run);
                unrelated.id = 203;
                unrelated.conclusion = 'failure';
                if (difference === 'another PR') unrelated.pull_requests[0].number = 8;
                if (difference === 'another base branch') unrelated.pull_requests[0].base.ref = 'dev';
                if (difference === 'another base revision') unrelated.pull_requests[0].base.sha = changedSha;
                fixture.records.extraRuns = [unrelated];
                // Act
                const result = await mergeDependabotPullRequest(context, fixture);
                // Assert
                assert.equal(result.status, 'merged');
                assert.equal(writes(fixture.request).length, 1);
            }
        );
    }
});
