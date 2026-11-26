// #region Imports

import { setTimeout as delay } from 'node:timers/promises';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';

// #endregion

const shaPattern = /^[a-f0-9]{40}$/u;
const branchPattern = /^dependabot\/[a-zA-Z0-9_./-]+$/u;

/**
 * Refreshes stale dependency branches and requests full verification without merging them.
 *
 * @param context - Trusted repository identity and workflow event.
 * @param dependencies - Optional GitHub request and bounded waiting boundaries.
 * @returns One fixed, credential-free result per eligible dependency pull request.
 * @throws An Error when GitHub metadata or a branch update cannot be verified.
 * @remarks Executes no pull-request code. The separate merge owner must recheck the new head.
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
        workflow.name !== 'Desktop quality' ||
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
            results.push(await reconcilePull(number, identity, workflow, request, wait));
        } catch {
            results.push({ number,
                status: 'blocked',
                reason: 'request-failed' });
        }
    }
    return results;
}

async function reconcilePull(number, identity, workflow, request, wait) {
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
    if (
        !Number.isSafeInteger(runs?.total_count) ||
        runs.total_count < 0 ||
        runs.total_count > 100 ||
        !Array.isArray(runs?.workflow_runs) ||
        runs.workflow_runs.length !== runs.total_count
    ) throw new Error('Invalid dependency verification inventory.');
    const alreadyRequested = runs.workflow_runs.some(
        (run) => run.workflow_id === workflow.id &&
          run.head_sha === pull.head.sha &&
          run.head_branch === pull.head.ref &&
          sameRepository(run.repository, identity) &&
          sameRepository(run.head_repository, identity) &&
          (run.event === 'workflow_dispatch' ||
            (run.event === 'pull_request' &&
              run.conclusion !== 'action_required' &&
              run.status !== 'waiting'))
    );
    if (alreadyRequested) {
        return { number,
            status: 'waiting',
            reason: 'verification-already-requested' };
    }

    const latest = await request('GET', pullPath);
    if (
        !eligible(latest, identity, number) ||
        latest.head.sha !== pull.head.sha ||
        latest.head.ref !== pull.head.ref
    ) {
        return { number,
            status: 'skipped',
            reason: 'pull-request-changed' };
    }
    await request('POST', `${root}/actions/workflows/ci.yml/dispatches`, {
        ref: pull.head.ref,
        inputs: { expected_head_sha: pull.head.sha }
    });
    return { number,
        status: 'verification-requested',
        head: pull.head.sha };
}

function sameRepository(value, identity) {
    return value?.id === identity.id && value?.full_name === identity.fullName;
}

function eligible(pull, identity, number) {
    return (
        pull?.number === number &&
        pull?.state === 'open' &&
        pull.draft === false &&
        pull.merged === false &&
        pull.user?.login === 'dependabot[bot]' &&
        pull.user?.type === 'Bot' &&
        sameRepository(pull.head?.repo, identity) &&
        sameRepository(pull.base?.repo, identity) &&
        pull.base.ref === identity.defaultBranch &&
        shaPattern.test(pull.head.sha ?? '') &&
    branchPattern.test(pull.head.ref ?? '') &&
    !pull.head.ref.includes('..') &&
    !pull.head.ref.includes('//')
    );
}
