// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import { authorizePullRequestWorkflows } from './authorizePullRequestWorkflows.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const M = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const tree = 'd'.repeat(40);
const prefix = 'repos/pixel-brewery/wortlaut';
const branch = 'dependabot/npm_and_yarn/frameworks';
const context = { eventName: 'schedule',
    repository: 'pixel-brewery/wortlaut',
    repositoryId: 1444820071,
    defaultBranch: 'main',
    number: 7 };
const service = { id: 41898282,
    login: 'github-actions[bot]',
    type: 'Bot' };
const bot = { id: 49699333,
    login: 'dependabot[bot]',
    type: 'Bot' };
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

function controlled() {
    const repo = {
        id: 1444820071,
        name: 'wortlaut',
        full_name: 'pixel-brewery/wortlaut',
        default_branch: 'main',
        private: false,
        visibility: 'public',
        fork: false
    };
    const pull = {
        number: 7,
        state: 'open',
        draft: false,
        merged: false,
        merged_at: null,
        mergeable: true,
        merge_commit_sha: C,
        user: { ...bot },
        head: { sha: B,
            ref: branch,
            repo },
        base: { sha: M,
            ref: 'main',
            repo }
    };
    const run = {
        id: 20,
        run_attempt: 1,
        event: 'pull_request',
        workflow_id: 10,
        name: 'Desktop quality',
        path: '.github/workflows/ci.yml',
        status: 'completed',
        conclusion: 'action_required',
        head_sha: B,
        head_branch: branch,
        repository: repo,
        head_repository: repo,
        actor: { ...service },
        triggering_actor: { ...service },
        pull_requests: [{ number: 7,
            head: structuredClone(pull.head),
            base: structuredClone(pull.base) }]
    };
    const state = {
        repo,
        pull,
        run,
        workflow: { id: 10,
            name: 'Desktop quality',
            path: '.github/workflows/ci.yml',
            state: 'active' },
        releaseWorkflow: { id: 11,
            name: verificationPolicy.releaseWorkflowName,
            path: '.github/workflows/release.yml',
            state: 'active' },
        main: { name: 'main',
            commit: { sha: M } },
        branch: { object: { type: 'commit',
            sha: B } },
        mergeRef: { object: { type: 'commit',
            sha: C } },
        candidate: { sha: B,
            tree: { sha: tree } },
        merge: { sha: C,
            tree: { sha: tree },
            parents: [{ sha: M }, { sha: B }] },
        comparison: { behind_by: 0,
            merge_base_commit: { sha: M } },
        baseline: ci,
        proposed: ci,
        associations: [pull],
        runs: [run],
        rules: [
            { type: 'pull_request' },
            {
                type: 'required_status_checks',
                parameters: {
                    strict_required_status_checks_policy: true,
                    required_status_checks: verificationPolicy.requiredChecks.map((context) => ({ context,
                        integration_id: 15368 }))
                }
            }
        ]
    };
    const calls = new Map();
    const request = ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))((method, endpoint) => {
        const count = (calls.get(endpoint) ?? 0) + 1;
        calls.set(endpoint, count);
        if (method === 'POST' && endpoint === `${prefix}/actions/runs/20/approve`) {
            if (state.denyApproval) throw new Error('Synthetic private HTTP 403 response.');
            return undefined;
        }
        if (method !== 'GET') throw new Error('Unexpected write.');
        if (endpoint === 'repositories/1444820071') return structuredClone(state.repo);
        if (endpoint.startsWith(`${prefix}/pulls?state=open&base=main&per_page=100&page=`)) {
            const page = Number(endpoint.split('page=').at(-1));
            return state.openPages
                ? state.openPages[page - 1]
                : page === 1
                    ? [state.pull, { number: 8,
                        user: { id: 1,
                            login: 'maintainer',
                            type: 'User' } }]
                    : [];
        }
        if (endpoint === `${prefix}/actions/workflows/release.yml`) return structuredClone(state.releaseWorkflow);
        if (endpoint === `${prefix}/actions/runs/30`) return structuredClone(state.triggeredRun);
        if (endpoint === `${prefix}/actions/workflows/ci.yml`) return structuredClone(count > 1 && state.nextWorkflow ? state.nextWorkflow : state.workflow);
        if (endpoint === `${prefix}/pulls/7`) return structuredClone(count > 1 && state.nextPull ? state.nextPull : state.pull);
        if (endpoint === `${prefix}/branches/main`) return structuredClone(count > 1 && state.nextMain ? state.nextMain : state.main);
        if (endpoint === `${prefix}/git/ref/heads/${branch}`) return structuredClone(state.branch);
        if (endpoint === `${prefix}/git/ref/pull/7/merge`) return structuredClone(state.mergeRef);
        if (endpoint === `${prefix}/git/commits/${B}`) return structuredClone(state.candidate);
        if (endpoint === `${prefix}/git/commits/${C}`) return structuredClone(state.merge);
        if (endpoint === `${prefix}/compare/${M}...${B}`) return structuredClone(state.comparison);
        if (endpoint === `${prefix}/commits/${B}/pulls?per_page=100`) return structuredClone(state.associations);
        if (endpoint === `${prefix}/actions/workflows/ci.yml/runs?head_sha=${B}&per_page=100`) return { total_count: state.incomplete ? state.runs.length + 1 : state.runs.length,
            workflow_runs: structuredClone(state.runs) };
        if (endpoint === `${prefix}/actions/runs/20`) return structuredClone(count > 1 && state.nextRun ? state.nextRun : state.run);
        if (endpoint.startsWith(`${prefix}/actions/runs/`)) return structuredClone(state.runs.find((run) => String(run.id) === endpoint.split('/').at(-1)));
        if (endpoint === `${prefix}/rules/branches/main`) return structuredClone(state.rules);
        if (endpoint.startsWith(`${prefix}/contents/.github/workflows/ci.yml?ref=`)) {
            const text = endpoint.endsWith(M) ? state.baseline : state.proposed;
            const bytes = Buffer.from(text);
            return {
                type: 'file',
                encoding: 'base64',
                content: bytes.toString('base64'),
                sha: state.badBlob
                    ? M
                    : createHash('sha1').update(`blob ${bytes.length}\0`)
                        .update(bytes)
                        .digest('hex')
            };
        }
        throw new Error('Unexpected fixed metadata route.');
    });
    return { state,
        request };
}

const writes = (request) => request.mock.calls.map((call) => call.arguments).filter(([method]) => method !== 'GET');

function completedTrigger(state, release = false, conclusion = 'success') {
    return {
        ...structuredClone(state.run),
        id: 30,
        run_attempt: 1,
        conclusion,
        head_sha: M,
        head_branch: release ? 'main' : 'dependabot/npm_and_yarn/previous-head',
        pull_requests: [],
        event: release ? 'push' : 'pull_request',
        workflow_id: release ? state.releaseWorkflow.id : state.workflow.id,
        name: release ? state.releaseWorkflow.name : state.workflow.name,
        path: release ? state.releaseWorkflow.path : state.workflow.path
    };
}

const notified = { ...context,
    eventName: 'workflow_run',
    runId: 30,
    runAttempt: 1 };

describe('Post-reconciliation current native authorization', () => {
    for (const eventName of ['schedule', 'workflow_dispatch']) {
        it('reads the current complete bot inventory after ' + eventName + '', async() => {
        // Arrange
            const fixture = controlled();
            // Act
            const result = await authorizePullRequestWorkflows({ ...context,
                eventName }, fixture);
            // Assert
            assert.deepEqual(result, [{ number: 7,
                status: 'verification-approved',
                head: B,
                runId: 20,
                runAttempt: 1 }]);
            assert.deepEqual(writes(fixture.request), [['POST', `${prefix}/actions/runs/20/approve`]]);
        });
    }

    for (const [release, conclusion] of [
        [false, 'success'], [false, 'failure'], [true, 'success'], [true, 'failure']
    ]) {
        it('authorizes the current proved native run after completed release=' + release + ' / ' + conclusion + ', independently of the old trigger head', async() => {
        // Arrange
            const fixture = controlled();
            fixture.state.triggeredRun = completedTrigger(fixture.state, release, conclusion);
            // Act
            const result = await authorizePullRequestWorkflows(notified, fixture);
            // Assert
            assert.deepEqual(result[0], { number: 7,
                status: 'verification-approved',
                head: B,
                runId: 20,
                runAttempt: 1 });
            assert.deepEqual(writes(fixture.request), [['POST', `${prefix}/actions/runs/20/approve`]]);
        });
    }

    it('does not mistake the old notification attempt for the current candidate authorization attempt', async() => {
        // Arrange
        const fixture = controlled();
        fixture.state.triggeredRun = { ...completedTrigger(fixture.state),
            run_attempt: 2 };
        fixture.state.run.run_attempt = 3;
        // Act
        const result = await authorizePullRequestWorkflows(notified, fixture);
        // Assert
        assert.equal(result[0].runAttempt, 3);
        assert.deepEqual(writes(fixture.request), [['POST', `${prefix}/actions/runs/20/approve`]]);
    });

    for (const change of [
        { id: 31 }, { run_attempt: 0 }, { status: 'queued' }, { name: 'Unrelated workflow' },
        { workflow_id: 99 }, { path: '.github/workflows/foreign.yml' },
        { head_repository: { id: 1 } }, { repository: { id: 1444820071,
            full_name: 'foreign/project' } }
    ]) {
        it('rejects an unrelated or malformed workflow reason before the current inventory: ' + JSON.stringify(change) + '', async() => {
        // Arrange
            const fixture = controlled();
            fixture.state.triggeredRun = { ...completedTrigger(fixture.state),
                ...change };
            // Act
            const result = await authorizePullRequestWorkflows(notified, fixture);
            // Assert
            assert.deepEqual(result, []);
            assert.deepEqual(writes(fixture.request), []);
            assert.equal(fixture.request.mock.calls.map((call) => call.arguments).some(([, endpoint]) => endpoint.includes('/pulls?state=open')), false);
        });
    }

    it('loads every inventory page before the first approval', async() => {
        // Arrange
        const fixture = controlled();
        const humans = Array.from({ length: 99 }, (_, index) => ({ number: index + 100,
            user: { id: 1,
                login: 'maintainer',
                type: 'User' } }));
        fixture.state.openPages = [[fixture.state.pull, ...humans], []];
        // Act
        const result = await authorizePullRequestWorkflows(context, fixture);
        // Assert
        assert.equal(result[0].status, 'verification-approved');
        const calls = fixture.request.mock.calls.map((call) => call.arguments);
        assert.equal(calls.findIndex(([, path]) => path.endsWith('page=2')) < calls.findIndex(([method]) => method === 'POST'), true);
    });

    for (const problem of ['malformed-first', 'overlong-first', 'malformed-second', 'bounded-overflow']) {
        it('retains a malformed or incomplete current inventory before any approval: ' + problem + '', async() => {
        // Arrange
            const fixture = controlled();
            const full = Array.from({ length: 100 }, () => fixture.state.pull);
            fixture.state.openPages = problem === 'malformed-first' ? [null] : problem === 'overlong-first' ? [[...full, fixture.state.pull]] : problem === 'malformed-second' ? [full, null] : [full, full, full, full, full];
            // Act
            const result = authorizePullRequestWorkflows(context, fixture);
            // Assert
            await assert.rejects(result, (error) => error instanceof Error && error.message.includes('inventory'));
            assert.deepEqual(writes(fixture.request), []);
        });
    }

    it('keeps all current single-run source guards when a valid release triggers inspection', async() => {
        // Arrange
        const fixture = controlled();
        fixture.state.triggeredRun = completedTrigger(fixture.state, true);
        fixture.state.branch.object.sha = M;
        // Act
        const result = await authorizePullRequestWorkflows(notified, fixture);
        // Assert
        assert.notEqual(result[0].status, 'verification-approved');
        assert.deepEqual(writes(fixture.request), []);
    });

    it('sanitizes a failed approval without retrying the current native run', async() => {
        // Arrange
        const fixture = controlled();
        fixture.state.denyApproval = true;
        // Act
        const result = await authorizePullRequestWorkflows(context, fixture);
        // Assert
        assert.deepEqual(result, [{ number: 7,
            status: 'blocked',
            reason: 'approval-request-failed' }]);
        assert.equal(writes(fixture.request).length, 1);
    });
});
