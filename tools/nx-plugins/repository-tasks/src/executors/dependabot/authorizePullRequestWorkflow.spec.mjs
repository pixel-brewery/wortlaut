// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import { authorizePullRequestWorkflow } from './authorizePullRequestWorkflow.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const M = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const tree = 'd'.repeat(40);
const prefix = 'repos/pixel-brewery/wortlaut';
const branch = 'dependabot/npm_and_yarn/frameworks';
const context = {
    eventName: 'schedule',
    repository: 'pixel-brewery/wortlaut',
    repositoryId: 1444820071,
    defaultBranch: 'main',
    number: 7
};
const service = { id: 41898282,
    login: 'github-actions[bot]',
    type: 'Bot' };
const bot = { id: 49699333,
    login: 'dependabot[bot]',
    type: 'Bot' };
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

function jobSetting(text, value) {
    return text.replace(
        /^(jobs:\n)([ ]+)([A-Za-z_][\w-]*:\n)/mu,
        (_match, jobs, indent, key) => `${jobs}${indent}${key}${indent}${indent}${value}\n`
    );
}

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
        pull_requests: [
            { number: 7,
                head: structuredClone(pull.head),
                base: structuredClone(pull.base) }
        ]
    };
    const state = {
        repo,
        pull,
        run,
        workflow: {
            id: 10,
            name: 'Desktop quality',
            path: '.github/workflows/ci.yml',
            state: 'active'
        },
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
                    required_status_checks: verificationPolicy.requiredChecks.map((context) => ({
                        context,
                        integration_id: 15368
                    }))
                }
            }
        ]
    };
    const calls = new Map();
    const request = ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))(
        (method, endpoint) => {
            const count = (calls.get(endpoint) ?? 0) + 1;
            calls.set(endpoint, count);
            if (method === 'POST' && endpoint === `${prefix}/actions/runs/20/approve`) {
                if (state.denyApproval) throw new Error('Synthetic private HTTP 403 response.');
                return undefined;
            }
            if (method !== 'GET') throw new Error('Unexpected write.');
            if (endpoint === 'repositories/1444820071') return structuredClone(state.repo);
            if (endpoint === `${prefix}/actions/workflows/ci.yml`) return structuredClone(
                count > 1 && state.nextWorkflow ? state.nextWorkflow : state.workflow
            );
            if (endpoint === `${prefix}/pulls/7`) return structuredClone(count > 1 && state.nextPull ? state.nextPull : state.pull);
            if (endpoint === `${prefix}/branches/main`) return structuredClone(count > 1 && state.nextMain ? state.nextMain : state.main);
            if (endpoint === `${prefix}/git/ref/heads/${branch}`) return structuredClone(state.branch);
            if (endpoint === `${prefix}/git/ref/pull/7/merge`) return structuredClone(state.mergeRef);
            if (endpoint === `${prefix}/git/commits/${B}`) return structuredClone(state.candidate);
            if (endpoint === `${prefix}/git/commits/${C}`) return structuredClone(state.merge);
            if (endpoint === `${prefix}/compare/${M}...${B}`) return structuredClone(state.comparison);
            if (endpoint === `${prefix}/commits/${B}/pulls?per_page=100`) return structuredClone(state.associations);
            if (endpoint === `${prefix}/actions/workflows/ci.yml/runs?head_sha=${B}&per_page=100`) return {
                total_count: state.incomplete ? state.runs.length + 1 : state.runs.length,
                workflow_runs: structuredClone(state.runs)
            };
            if (endpoint === `${prefix}/actions/runs/20`) return structuredClone(count > 1 && state.nextRun ? state.nextRun : state.run);
            if (endpoint.startsWith(`${prefix}/actions/runs/`)) return structuredClone(
                state.runs.find((run) => String(run.id) === endpoint.split('/').at(-1))
            );
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
        }
    );
    return { state,
        request };
}

const writes = (request) => request.mock.calls.map((call) => call.arguments).filter(([method]) => method !== 'GET');

describe('Native pull-request CI authorization', () => {
    it('approves exactly the real GHA-created native run and never substitutes a status or dispatch', async() => {
    // Arrange
        const fixture = controlled();
        // Act
        const result = await authorizePullRequestWorkflow(context, fixture);
        // Assert
        assert.deepEqual(result, {
            number: 7,
            status: 'verification-approved',
            head: B,
            runId: 20,
            runAttempt: 1
        });
        assert.deepEqual(writes(fixture.request), [['POST', `${prefix}/actions/runs/20/approve`]]);
    });

    for (const [_label, change] of [
        [
            'same-owner full action pin',
            (s) => {
                s.proposed = ci.replace(
                    /(uses: [^@\n]+@)[a-f0-9]{40}(?:[ ]+# v?[^\n]+)?/u,
                    '$1' + 'b'.repeat(40) + ' # v8.1.0'
                );
            }
        ],
        [
            'newer diagnostic does not shadow the original native run',
            (s) => {
                s.runs.push({
                    ...s.run,
                    id: 21,
                    event: 'workflow_dispatch',
                    conclusion: 'success',
                    pull_requests: []
                });
            }
        ],
        [
            'Dependabot service actor',
            (s) => {
                s.run.actor = { ...bot };
                s.run.triggering_actor = { ...bot };
            }
        ]
    ]) {
        it('retains ' + _label + '', async() => {
            // Arrange
            const fixture = controlled();
            change(fixture.state);
            // Act
            const result = await authorizePullRequestWorkflow(context, fixture);
            // Assert
            assert.equal(result.status, 'verification-approved');
            assert.equal(writes(fixture.request).length, 1);
        });
    }

    for (const [_label, change] of [
        [
            'spoofed PR bot ID',
            (s) => {
                s.pull.user.id = 1;
            }
        ],
        [
            'human PR author',
            (s) => {
                s.pull.user = { id: 1,
                    login: 'maintainer',
                    type: 'User' };
            }
        ],
        [
            'draft',
            (s) => {
                s.pull.draft = true;
            }
        ],
        [
            'closed PR',
            (s) => {
                s.pull.state = 'closed';
            }
        ],
        [
            'wrong PR number',
            (s) => {
                s.pull.number = 8;
            }
        ],
        [
            'foreign head repository',
            (s) => {
                s.pull.head.repo = { ...s.repo,
                    id: 1 };
            }
        ],
        [
            'foreign base',
            (s) => {
                s.pull.base.ref = 'dev';
            }
        ],
        [
            'private canonical repository',
            (s) => {
                s.repo.private = true;
            }
        ],
        [
            'ambiguous association',
            (s) => {
                s.associations.push({ ...s.pull,
                    number: 8 });
            }
        ],
        [
            'unknown mergeability',
            (s) => {
                s.pull.mergeable = null;
            }
        ],
        [
            'changed branch ref',
            (s) => {
                s.branch.object.sha = M;
            }
        ],
        [
            'changed merge ref',
            (s) => {
                s.mergeRef.object.sha = B;
            }
        ],
        [
            'wrong merge parent order',
            (s) => {
                s.merge.parents.reverse();
            }
        ],
        [
            'wrong merge tree',
            (s) => {
                s.merge.tree.sha = M;
            }
        ],
        [
            'malformed candidate tree',
            (s) => {
                s.candidate.tree.sha = 'invalid';
            }
        ],
        [
            'stale base',
            (s) => {
                s.comparison.behind_by = 1;
            }
        ],
        [
            'wrong merge base',
            (s) => {
                s.comparison.merge_base_commit.sha = C;
            }
        ],
        [
            'spoofed source bytes',
            (s) => {
                s.badBlob = true;
            }
        ],
        [
            'CI source runtime edit',
            (s) => {
                s.proposed = ci.replace('yarn verify', 'echo skipped');
            }
        ],
        [
            'action owner edit',
            (s) => {
                s.proposed = ci.replace('actions/checkout', 'foreign/checkout');
            }
        ],
        [
            'mutable action tag',
            (s) => {
                s.proposed = ci.replace(/(uses: [^@\n]+@)[a-f0-9]{40}/u, '$1v8');
            }
        ],
        [
            'identical writable root',
            (s) => {
                s.baseline = s.proposed = ci.replace('contents: read', 'contents: write');
            }
        ],
        [
            'identical custom secret',
            (s) => {
                s.baseline = s.proposed = ci.replace('yarn verify', 'echo ${{ secrets.PUBLISH_TOKEN }}');
            }
        ],
        [
            'case-insensitive custom secret',
            (s) => {
                s.baseline = s.proposed = ci.replace('yarn verify', 'echo ${{ SECRETS.PUBLISH_TOKEN }}');
            }
        ],
        [
            'environment secret inheritance',
            (s) => {
                s.baseline = s.proposed = jobSetting(ci, 'environment: release-main');
            }
        ],
        [
            'reusable workflow inheritance',
            (s) => {
                s.baseline = s.proposed = jobSetting(ci, `uses: other/repo/.github/workflows/ci.yml@${M}`);
            }
        ],
        [
            'inactive workflow',
            (s) => {
                s.workflow.state = 'disabled_manually';
            }
        ],
        [
            'foreign CI name',
            (s) => {
                s.workflow.name = 'Other';
            }
        ],
        [
            'diagnostic-only source',
            (s) => {
                s.run.event = 'workflow_dispatch';
            }
        ],
        [
            'human approval actor',
            (s) => {
                s.run.actor = { id: 1,
                    login: 'maintainer',
                    type: 'User' };
            }
        ],
        [
            'human triggering actor',
            (s) => {
                s.run.triggering_actor = { id: 1,
                    login: 'maintainer',
                    type: 'User' };
            }
        ],
        [
            'spoofed Actions ID',
            (s) => {
                s.run.actor.id = 1;
            }
        ],
        [
            'invalid current attempt',
            (s) => {
                s.run.run_attempt = 0;
            }
        ],
        [
            'successful CI is never approved again',
            (s) => {
                s.run.conclusion = 'success';
            }
        ],
        [
            'failed CI is never approved',
            (s) => {
                s.run.conclusion = 'failure';
            }
        ],
        [
            'running CI is retained',
            (s) => {
                s.run.status = 'in_progress';
                s.run.conclusion = null;
            }
        ],
        [
            'wrong workflow run path',
            (s) => {
                s.run.path = '.github/workflows/other.yml';
            }
        ],
        [
            'wrong run repository',
            (s) => {
                s.run.head_repository = { ...s.repo,
                    id: 1 };
            }
        ],
        [
            'ambiguous native run association',
            (s) => {
                s.run.pull_requests.push({ ...s.run.pull_requests[0],
                    number: 8 });
            }
        ],
        [
            'newer native failure',
            (s) => {
                s.runs.push({ ...s.run,
                    id: 21,
                    conclusion: 'failure' });
            }
        ],
        [
            'missing enforced PR gate',
            (s) => {
                s.rules.shift();
            }
        ],
        [
            'non-strict checks',
            (s) => {
                s.rules[1].parameters.strict_required_status_checks_policy = false;
            }
        ],
        [
            'foreign check integration',
            (s) => {
                s.rules[1].parameters.required_status_checks[0].integration_id = 1;
            }
        ],
        [
            'main moves before approval',
            (s) => {
                s.nextMain = { name: 'main',
                    commit: { sha: C } };
            }
        ],
        [
            'head moves before approval',
            (s) => {
                s.nextPull = { ...structuredClone(s.pull),
                    head: { ...s.pull.head,
                        sha: C } };
            }
        ],
        [
            'attempt changes before approval',
            (s) => {
                s.nextRun = { ...s.run,
                    run_attempt: 2 };
            }
        ],
        [
            'workflow disabled before approval',
            (s) => {
                s.nextWorkflow = { ...s.workflow,
                    state: 'disabled_manually' };
            }
        ]
    ]) {
        it('sends no approval for ' + _label + '', async() => {
            // Arrange
            const fixture = controlled();
            change(fixture.state);
            // Act
            const result = await authorizePullRequestWorkflow(context, fixture);
            // Assert
            assert.notEqual(result.status, 'verification-approved');
            assert.deepEqual(writes(fixture.request), []);
        });
    }

    it('rejects incomplete native inventory without an approval', async() => {
    // Arrange
        const fixture = controlled();
        fixture.state.incomplete = true;
        // Act
        const result = authorizePullRequestWorkflow(context, fixture);
        // Assert
        await assert.rejects(
            result,
            (error) => error instanceof Error && error.message.includes('inventory is incomplete')
        );
        assert.deepEqual(writes(fixture.request), []);
    });

    it('does not retry or expose an approval failure', async() => {
    // Arrange
        const fixture = controlled();
        fixture.state.denyApproval = true;
        // Act
        const result = authorizePullRequestWorkflow(context, fixture);
        // Assert
        await assert.rejects(result);
        assert.equal(writes(fixture.request).length, 1);
    });

    it('ignores a foreign controller before any API access', async() => {
    // Arrange
        const fixture = controlled();
        // Act
        const result = await authorizePullRequestWorkflow(
            { ...context,
                repository: 'other/repo' },
            fixture
        );
        // Assert
        assert.equal(result.reason, 'unsupported-repository');
        assert.equal(fixture.request.mock.callCount() === 0, true);
    });
});
