// #region Imports

import { setTimeout as delay } from 'node:timers/promises';
import { isCanonicalPullRequest } from './isCanonicalPullRequest.mjs';
import { mergeDependabotPullRequest } from './mergeDependabotPullRequest.mjs';
import { readLatestPullRequestRun } from './readLatestPullRequestRun.mjs';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';

// #endregion

const shaPattern = /^[a-f0-9]{40}$/u;

/**
 * Refreshes dependency branches and resumes the strict merger after actual native CI.
 *
 * @param context - Trusted repository identity and workflow event.
 * @param dependencies - Optional GitHub request and bounded waiting boundaries.
 * @returns One fixed, credential-free result per eligible dependency pull request.
 * @throws An Error when GitHub metadata or a branch update cannot be verified.
 * @remarks Executes no pull-request code. A successful ordinary PR is passed to the unchanged full merge gates; diagnostic dispatch never supplies native branch proof.
 *
 * @internal
 */
export async function reconcileDependabotBranches(context, dependencies = {}) {
    if (!['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName)) return [];

    const request = dependencies.request ?? requestDependabotGitHub;
    const wait = dependencies.wait ?? (() => delay(750));
    const identity = await resolveDependabotRepository(context, request);
    if (!identity) return [];

    const root = identity.path;
    const workflow = await request('GET', `${root}/actions/workflows/ci.yml`);
    if (
        !Number.isSafeInteger(workflow?.id) ||
        workflow.id <= 0 ||
        workflow.path !== '.github/workflows/ci.yml' ||
        workflow.name !== verificationPolicy.workflowName ||
        workflow.state !== 'active'
    ) throw new Error('The dependency verification workflow changed.');

    const pulls = [];
    for (let page = 1; page <= 5; page++) {
        const batch = await request(
            'GET',
            `${root}/pulls?state=open&base=${encodeURIComponent(identity.defaultBranch)}&per_page=100&page=${page}`
        );
        if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid dependency inventory.');
        pulls.push(...batch);
        if (batch.length < 100) break;
        if (page === 5) throw new Error('Dependency inventory exceeds its bound.');
    }

    const results = [];
    for (const item of pulls.filter((pull) => pull?.user?.login === 'dependabot[bot]').slice(0, 30)) {
        const number = item.number;
        if (!Number.isSafeInteger(number) || number <= 0) continue;
        try {
            results.push(await reconcilePull(number, context, identity, workflow, request, wait));
        } catch {
            results.push({ number,
                status: 'blocked',
                reason: 'request-failed' });
        }
    }
    return results;
}

async function reconcilePull(number, context, identity, workflow, request, wait) {
    const root = identity.path;
    const pullPath = `${root}/pulls/${number}`;
    let pull = await request('GET', pullPath);
    if (!eligible(pull, identity, number)) return { number,
        status: 'skipped',
        reason: 'pull-request-changed' };
    const main = await request(
        'GET',
        `${root}/branches/${encodeURIComponent(identity.defaultBranch)}`
    );
    if (main?.name !== identity.defaultBranch || !shaPattern.test(main?.commit?.sha ?? '')) throw new Error('Invalid default branch.');
    const comparison = await request('GET', `${root}/compare/${main.commit.sha}...${pull.head.sha}`);
    if (
        !Number.isSafeInteger(comparison?.behind_by) ||
        comparison.behind_by < 0 ||
        !shaPattern.test(comparison?.merge_base_commit?.sha ?? '')
    ) throw new Error('Invalid branch comparison.');
    const oldHead = pull.head.sha;
    if (comparison.behind_by !== 0 || comparison.merge_base_commit.sha !== main.commit.sha) {
        await request('PUT', `${pullPath}/update-branch`, { expected_head_sha: oldHead });
        for (let attempt = 0; attempt < 16; attempt++) {
            await wait();
            pull = await request('GET', pullPath);
            if (!eligible(pull, identity, number)) break;
            if (pull.head.sha !== oldHead) break;
        }
        if (!eligible(pull, identity, number)) {
            return { number,
                status: 'skipped',
                reason: 'pull-request-changed' };
        }
        if (pull.head.sha === oldHead) {
            return { number,
                status: 'waiting',
                reason: 'branch-refresh-pending' };
        }
    }

    const runs = await request(
        'GET',
        `${root}/actions/workflows/ci.yml/runs?head_sha=${pull.head.sha}&per_page=100`
    );
    const selected = readLatestPullRequestRun(runs, identity, workflow, pull);
    if (selected) {
        const run = await request('GET', `${root}/actions/runs/${selected.id}`);
        const native = readLatestPullRequestRun(
            { total_count: 1,
                workflow_runs: [run] },
            identity,
            workflow,
            pull
        );
        if (!native || native.id !== selected.id || native.run_attempt < selected.run_attempt) return { number,
            status: 'waiting',
            reason: 'workflow-run-changed' };
        if (native.status === 'completed' && native.conclusion === 'success') {
            const result = await mergeDependabotPullRequest(
                { ...context,
                    eventName: 'workflow_run',
                    runId: native.id,
                    runAttempt: native.run_attempt },
                { request }
            );
            return result.status === 'merged'
                ? { number,
                    status: 'merged',
                    sha: result.sha,
                    head: pull.head.sha }
                : { number,
                    status: 'skipped',
                    reason: result.reason };
        }
        if (native.status === 'completed' && native.conclusion === 'action_required') return {
            number,
            status: 'approval-required',
            head: pull.head.sha,
            runId: native.id,
            runAttempt: native.run_attempt
        };
        return { number,
            status: 'waiting',
            reason: 'verification-already-requested' };
    }
    const diagnostic = runs.workflow_runs.some(
        (run) => Number.isSafeInteger(run?.id) &&
          run.id > 0 &&
          Number.isSafeInteger(run.run_attempt) &&
          run.run_attempt > 0 &&
          run.event === 'workflow_dispatch' &&
          run.workflow_id === workflow.id &&
          run.name === workflow.name &&
          run.path === workflow.path &&
          run.head_sha === pull.head.sha &&
          run.head_branch === pull.head.ref &&
      sameRepository(run.repository, identity) &&
      sameRepository(run.head_repository, identity)
    );
    if (diagnostic) return { number,
        status: 'waiting',
        reason: 'diagnostic-already-requested' };
    return { number,
        status: 'waiting',
        reason: 'native-ci-not-observed',
        head: pull.head.sha };
}

function sameRepository(value, identity) {
    return value?.id === identity.id && value?.full_name === identity.fullName;
}

function eligible(pull, identity, number) {
    return pull?.number === number && isCanonicalPullRequest(pull, identity);
}
