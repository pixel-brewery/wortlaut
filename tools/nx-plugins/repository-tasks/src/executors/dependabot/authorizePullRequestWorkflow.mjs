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

/**
 * Authorizes one actual approval-required PR CI attempt after full read-only source proof.
 *
 * @param context - Trusted default-branch controller identity and the exact PR number.
 * @param dependencies - The bounded request and optional immutable metadata verifier.
 * @returns An approval receipt or a fixed waiting/skipped reason.
 * @remarks Only immutable Dependabot or GitHub Actions service actors may request approval. Ordinary successful maintainer PR CI remains a separate valid merge path. This sends no reviews, statuses, rules, release commands or diagnostic replacement checks and never retries an approval.
 * @internal
 */
export async function authorizePullRequestWorkflow(context, dependencies = {}) {
    const number = context?.number;
    const kind = context?.kind ?? 'dependabot';
    const skipped = (reason) => ({ number,
        status: 'waiting',
        reason });
    if (
        !['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName) ||
        !Number.isSafeInteger(number) ||
        number <= 0 ||
        !['dependabot', 'release-metadata'].includes(kind) ||
        (kind === 'release-metadata' && !dependencies.verifyMetadata)
    ) return skipped('unsupported-approval-context');
    const request = dependencies.request ?? requestDependabotGitHub;
    const identity = await resolveDependabotRepository(context, request);
    if (!identity) return skipped('unsupported-repository');
    const prefix = identity.path;
    const workflow = await request(
        'GET',
        `${prefix}/actions/workflows/${verificationPolicy.workflowFile}`
    );
    if (
        !Number.isSafeInteger(workflow?.id) ||
        workflow.id <= 0 ||
        workflow.path !== verificationPolicy.workflowPath ||
        workflow.name !== verificationPolicy.workflowName ||
        workflow.state !== 'active'
    ) return skipped('unexpected-workflow');
    const pull = await request('GET', `${prefix}/pulls/${number}`);
    if (pull?.number !== number || !isCanonicalPullRequest(pull, identity, kind)) return skipped('pull-request-changed');
    const proof = await verifyPullRequestSource(identity, workflow, pull, request, kind);
    if (
        !proof ||
        !await uniqueAssociation(pull) ||
        (kind === 'release-metadata' && !await dependencies.verifyMetadata(pull))
    ) return skipped('unproven-readonly-source');
    const run = await latest(pull);
    if (!required(run)) return skipped('native-ci-not-awaiting-approval');
    const current = await request('GET', `${prefix}/pulls/${number}`);
    if (current?.number !== number) return skipped('pull-request-changed');
    const fresh = await verifyPullRequestSource(identity, workflow, current, request, kind);
    if (
        !fresh ||
        fresh.M !== proof.M ||
        fresh.B !== proof.B ||
        fresh.C !== proof.C ||
        !await uniqueAssociation(current) ||
        (kind === 'release-metadata' && !await dependencies.verifyMetadata(current))
    ) return skipped('pull-request-changed');
    const currentWorkflow = await request(
        'GET',
        `${prefix}/actions/workflows/${verificationPolicy.workflowFile}`
    );
    if (
        currentWorkflow?.id !== workflow.id ||
        currentWorkflow.state !== 'active' ||
        currentWorkflow.path !== workflow.path ||
        currentWorkflow.name !== workflow.name
    ) return skipped('workflow-changed');
    const currentRun = await latest(current);
    if (
        !required(currentRun) ||
        currentRun.id !== run.id ||
        currentRun.run_attempt !== run.run_attempt
    ) return skipped('workflow-run-changed');
    if (
        !await requireMergeProtection(request, prefix) ||
        !await readCurrentPullRequestSource(identity, current, proof, request, kind)
    ) return skipped('source-or-protection-changed');
    await request('POST', `${prefix}/actions/runs/${currentRun.id}/approve`);
    return {
        number,
        status: 'verification-approved',
        head: proof.B,
        runId: currentRun.id,
        runAttempt: currentRun.run_attempt
    };

    async function latest(pull) {
        const inventory = await request(
            'GET',
            `${prefix}/actions/workflows/${verificationPolicy.workflowFile}/runs?head_sha=${pull.head.sha}&per_page=100`
        );
        const selected = readLatestPullRequestRun(inventory, identity, workflow, pull);
        if (!selected) return;
        const current = await request('GET', `${prefix}/actions/runs/${selected.id}`);
        const verified = readLatestPullRequestRun(
            { total_count: 1,
                workflow_runs: [current] },
            identity,
            workflow,
            pull
        );
        if (verified?.id === selected.id && verified.run_attempt >= selected.run_attempt) return verified;
    }
    async function uniqueAssociation(pull) {
        const records = await request('GET', `${prefix}/commits/${pull.head.sha}/pulls?per_page=100`);
        if (!Array.isArray(records) || records.length >= 100) return false;
        const matching = records.filter(
            (item) => isCanonicalPullRequest(item, identity, kind, true) && item.head.sha === pull.head.sha
        );
        return matching.length === 1 && matching[0].number === pull.number;
    }
}

function required(run) {
    const service = (actor) => actor?.type === 'Bot' &&
      ((actor.id === 49699333 && actor.login === 'dependabot[bot]') ||
        (actor.id === 41898282 && actor.login === 'github-actions[bot]'));
    return (
        run?.status === 'completed' &&
        run.conclusion === 'action_required' &&
        service(run.actor) &&
        service(run.triggering_actor)
    );
}
