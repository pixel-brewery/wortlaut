// #region Imports
import { authorizePullRequestWorkflow } from './authorizePullRequestWorkflow.mjs';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

/**
 * Authorizes freshly reconciled bot heads from a bounded current inventory.
 *
 * @param context - The trusted default-branch maintenance event and repository identity.
 * @param dependencies - The bounded existing-token metadata boundary.
 * @returns One fixed authorization outcome per current own bot PR, at most thirty.
 * @remarks The isolated caller waits for branch reconciliation. A completed own CI or release run is only a reason to inspect current candidates; its old conclusion, PR association and attempt never authorize another run. Every candidate still passes the unchanged single-run source, actor, attempt, ref and protection proof immediately before its one approval request. No source/PR write, dependency installation, merge or publication occurs here.
 * @internal
 */
export async function authorizePullRequestWorkflows(context, dependencies = {}) {
    if (!['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName)) return [];
    const request = dependencies.request ?? requestDependabotGitHub;
    const identity = await resolveDependabotRepository(context, request);
    if (!identity) return [];
    if (context.eventName === 'workflow_run') {
        const runId = positive(context.runId);
        const notifiedAttempt = positive(context.runAttempt);
        if (!runId || !notifiedAttempt) return [];
        const run = await request('GET', `${identity.path}/actions/runs/${runId}`);
        const definitions = [
            { file: verificationPolicy.workflowFile,
                path: verificationPolicy.workflowPath,
                name: verificationPolicy.workflowName },
            { file: 'release.yml',
                path: '.github/workflows/release.yml',
                name: verificationPolicy.releaseWorkflowName }
        ];
        const definition = definitions.find((value) => typeof value.name === 'string' && value.name === run?.name);
        const canonical = (repository) => repository?.id === identity.id && repository.full_name === identity.fullName;
        if (!definition || run.id !== runId || !positive(run.run_attempt) || run.run_attempt < notifiedAttempt || run.status !== 'completed' ||
          !canonical(run.repository) || !canonical(run.head_repository) ||
          !(run.path === definition.path || run.path?.startsWith(`${definition.path}@`))) return [];
        const workflow = await request('GET', `${identity.path}/actions/workflows/${definition.file}`);
        if (!positive(workflow?.id) || workflow.id !== run.workflow_id || workflow.name !== definition.name ||
          workflow.path !== definition.path || workflow.state !== 'active') return [];
    }
    const numbers = new Set();
    for (let page = 1; page <= 5; page++) {
        const pulls = await request('GET', `${identity.path}/pulls?state=open&base=${encodeURIComponent(identity.defaultBranch)}&per_page=100&page=${page}`);
        if (!Array.isArray(pulls) || pulls.length > 100) throw new Error('The authorization inventory is invalid.');
        for (const pull of pulls) {
            if (positive(pull?.number) && pull.user?.id === 49699333 && pull.user.login === 'dependabot[bot]' && pull.user.type === 'Bot') numbers.add(pull.number);
        }
        if (pulls.length < 100) break;
        if (page === 5) throw new Error('The authorization inventory exceeds its bound.');
    }
    const results = [];
    for (const number of [...numbers].slice(0, 30)) {
        try {
            results.push(await authorizePullRequestWorkflow({ ...context,
                number }, { request }));
        } catch {
            results.push({ number,
                status: 'blocked',
                reason: 'approval-request-failed' });
        }
    }
    return results;
}

function positive(value) {
    const number = typeof value === 'string' && (/^[1-9]\d*$/u).test(value) ? Number(value) : value;
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
