// #region Imports
import { isCanonicalPullRequest } from './isCanonicalPullRequest.mjs';
import { readCurrentPullRequestSource } from './readCurrentPullRequestSource.mjs';
import { readLatestPullRequestRun } from './readLatestPullRequestRun.mjs';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { requireMergeProtection } from './requireMergeProtection.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
import { verifyPullRequestSource } from './verifyPullRequestSource.mjs';
// #endregion

const sha = /^[a-f0-9]{40}$/u;
const failure =
    'Dependabot merge stopped after a GitHub API request failed; inspect the pull request before retrying.';

/**
 * Merges the latest complete native PR CI attempt through unchanged branch protection.
 *
 * @param context - The trusted workflow notification, repository identity and current run attempt.
 * @param dependencies - The bounded REST and optional source-bound release metadata verifier.
 * @returns An actually confirmed protected merge or its unmet prerequisite.
 * @remarks Executes only trusted default-branch code. Maintainer CI is valid; diagnostic dispatch is never PR proof. Every live source, latest native attempt, real job and protection gate is checked again before one SHA-guarded merge. GitHub still owns the final expected-base race and merge decision.
 * @internal
 */
export async function mergeDependabotPullRequest(context, dependencies = {}) {
    const runId = positive(context?.runId);
    const runAttempt = positive(context?.runAttempt);
    const skipped = (reason) => ({ status: 'skipped',
        reason });
    if (context?.eventName !== 'workflow_run' || !runId || !runAttempt) return skipped('unsupported-context');
    const boundary = dependencies.request ?? requestDependabotGitHub;
    const request = async(method, endpoint, body) => {
        try {
            return await boundary(method, endpoint, body);
        } catch {
            throw new Error(failure);
        }
    };
    const identity = await resolveDependabotRepository(context, request);
    if (!identity) return skipped('unsupported-repository');
    const prefix = identity.path;
    const kind = context.kind ?? 'dependabot';
    if (!['dependabot', 'release-metadata'].includes(kind)) return skipped('unsupported-context');
    const workflowPath = `${prefix}/actions/workflows/${verificationPolicy.workflowFile}`;
    const workflow = await request('GET', workflowPath);
    if (!validWorkflow(workflow)) return skipped('unexpected-workflow');
    const runPath = `${prefix}/actions/runs/${runId}`;
    const run = await request('GET', runPath);
    if (!successful(run)) return skipped('ineligible-workflow-run');
    if (
        !Array.isArray(run.pull_requests) ||
        run.pull_requests.length !== 1 ||
        !positive(run.pull_requests[0]?.number)
    ) return skipped('ambiguous-pull-request');
    const number = run.pull_requests[0].number;
    const pullPath = `${prefix}/pulls/${number}`;
    const pull = await request('GET', pullPath);
    if (
        pull?.number !== number ||
        !isCanonicalPullRequest(pull, identity, kind) ||
        pull.head.sha !== run.head_sha ||
        pull.head.ref !== run.head_branch
    ) return skipped('ineligible-pull-request');
    if (!native(run, pull)) return skipped('ineligible-workflow-run');
    if (!await latest(run, pull)) return skipped('superseded-workflow-run');
    if (!await successfulJobs(run)) return skipped('incomplete-verification');
    const main = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
    if (main?.name !== identity.defaultBranch || !sha.test(main?.commit?.sha ?? '')) return skipped('invalid-main');
    const comparison = await request('GET', `${prefix}/compare/${main.commit.sha}...${run.head_sha}`);
    if (comparison?.behind_by !== 0 || comparison.merge_base_commit?.sha !== main.commit.sha) return skipped('branch-not-current');
    const proof = await verifyPullRequestSource(identity, workflow, pull, request, kind);
    if (!proof || !await unique(pull)) return skipped('unproven-readonly-source');
    if (kind === 'release-metadata' && !await dependencies.verifyMetadata?.(pull)) return skipped('invalid-release-metadata');
    const currentRun = await request('GET', runPath);
    if (!successful(currentRun) || !native(currentRun, pull) || !await latest(currentRun, pull)) return skipped('workflow-run-changed');
    const currentWorkflow = await request('GET', workflowPath);
    if (!validWorkflow(currentWorkflow) || currentWorkflow.id !== workflow.id) return skipped('workflow-changed');
    if (!await requireMergeProtection(request, prefix)) return skipped('missing-merge-protection');
    const current = await readCurrentPullRequestSource(identity, pull, proof, request, kind);
    if (!current || !await unique(current)) return skipped('pull-request-or-main-changed');
    if (kind === 'release-metadata' && !await dependencies.verifyMetadata?.(current)) return skipped('invalid-release-metadata');
    let merged;
    try {
        merged = await boundary('PUT', `${pullPath}/merge`, {
            sha: run.head_sha,
            merge_method: 'squash'
        });
    } catch (error) {
        if (error?.status === 405) {
            const changedMain = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
            const changedPull = await request('GET', pullPath);
            if (
                sha.test(changedMain?.commit?.sha ?? '') &&
                changedMain.commit.sha !== proof.M &&
                isCanonicalPullRequest(changedPull, identity, kind) &&
                changedPull.head.sha === proof.B
            ) {
                const changed = await request(
                    'GET',
                    `${prefix}/compare/${changedMain.commit.sha}...${proof.B}`
                );
                if (
                    Number.isSafeInteger(changed?.behind_by) &&
                    changed.behind_by > 0 &&
                    sha.test(changed.merge_base_commit?.sha ?? '') &&
                    changed.merge_base_commit.sha !== changedMain.commit.sha
                ) return skipped('main-changed');
            }
        }
    }
    if (!merged) throw new Error(failure);
    if (merged?.merged !== true || !sha.test(merged.sha ?? '')) throw new Error('GitHub did not confirm the dependency merge.');
    const confirmed = await request('GET', pullPath);
    if (
        confirmed?.state !== 'closed' ||
        confirmed.merged !== true ||
        confirmed.merge_commit_sha !== merged.sha
    ) throw new Error('GitHub did not confirm the merged pull request state.');
    return {
        status: 'merged',
        pullRequestNumber: number,
        sha: merged.sha,
        defaultBranch: identity.defaultBranch
    };

    function validWorkflow(value) {
        return (
            positive(value?.id) &&
            value.path === verificationPolicy.workflowPath &&
            value.name === verificationPolicy.workflowName &&
            value.state === 'active'
        );
    }
    function successful(value) {
        return (
            value?.id === runId &&
            value.run_attempt === runAttempt &&
            value.event === 'pull_request' &&
            value.status === 'completed' &&
            value.conclusion === 'success' &&
            value.workflow_id === workflow.id &&
            value.name === workflow.name &&
            (value.path === workflow.path || value.path?.startsWith(`${workflow.path}@`)) &&
            value.repository?.id === identity.id &&
            value.repository.full_name === identity.fullName &&
      value.head_repository?.id === identity.id &&
      value.head_repository.full_name === identity.fullName &&
      sha.test(value.head_sha ?? '')
        );
    }
    function native(value, pull) {
        return (
            readLatestPullRequestRun({ total_count: 1,
                workflow_runs: [value] }, identity, workflow, pull)
                ?.id === runId
        );
    }
    async function latest(value, pull) {
        const inventory = await request(
            'GET',
            `${prefix}/actions/workflows/${verificationPolicy.workflowFile}/runs?head_sha=${value.head_sha}&per_page=100`
        );
        const latest = readLatestPullRequestRun(inventory, identity, workflow, pull);
        return latest?.id === value.id && latest.run_attempt <= value.run_attempt;
    }
    async function unique(pull) {
        const values = await request('GET', `${prefix}/commits/${pull.head.sha}/pulls?per_page=100`);
        if (!Array.isArray(values) || values.length >= 100) return false;
        const matches = values.filter(
            (value) => isCanonicalPullRequest(value, identity, kind, true) && value.head.sha === pull.head.sha
        );
        return matches.length === 1 && matches[0].number === pull.number;
    }
    async function successfulJobs(value) {
        const records = [];
        let count;
        for (let page = 1; page <= 10; page++) {
            const response = await request(
                'GET',
                `${prefix}/actions/runs/${value.id}/attempts/${value.run_attempt}/jobs?per_page=100&page=${page}`
            );
            if (
                !Number.isSafeInteger(response?.total_count) ||
                response.total_count < 0 ||
                response.total_count > 1000 ||
                !Array.isArray(response.jobs) ||
                response.jobs.length > 100 ||
                (count !== undefined && response.total_count !== count)
            ) return false;
            count = response.total_count;
            records.push(...response.jobs);
            if (records.length > count) return false;
            if (records.length === count) break;
            if (response.jobs.length === 0) return false;
        }
        if (records.length !== count || records.length !== verificationPolicy.requiredJobs.length) return false;
        const names = new Set(verificationPolicy.requiredJobs);
        const ids = new Set();
        return (
            records.every(
                (job) => positive(job?.id) &&
                  !ids.has(job.id) &&
                  Boolean(ids.add(job.id)) &&
                  names.delete(job.name) &&
                  job.run_id === value.id &&
                  (job.run_attempt === undefined || job.run_attempt === value.run_attempt) &&
                  job.head_sha === value.head_sha &&
                  job.status === 'completed' &&
                  job.conclusion === 'success'
            ) && names.size === 0
        );
    }
}

function positive(value) {
    const number = typeof value === 'string' && (/^[1-9]\d*$/u).test(value) ? Number(value) : value;
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
