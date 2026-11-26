// #region Imports

import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';

// #endregion

const repository = 'pixel-brewery/wortlaut';
const repositoryId = 1444820071;
const workflowName = 'Desktop quality';
const workflowPath = '.github/workflows/ci.yml';
const repositoryPath = `repos/${repository}`;
const shaPattern = /^[0-9a-f]{40}$/u;
const requestFailure =
    'Verification request failed; inspect the original merge and verification runs before retrying.';

/**
 * Requests full repository verification for a successful native-token dependency merge.
 *
 * @param context - The trusted workflow event, immutable repository identity and exact merge source.
 * @param dependencies - An optional request(method, endpoint, body) boundary for offline verification.
 * @returns The requested, already-requested or superseded source result.
 * @throws An Error with a controlled diagnostic for invalid metadata, credentials or failed requests.
 * @remarks Existing successful, failed or cancelled verification attempts are retained instead of dispatched again. It checks out no PR code, performs no merge or publication, and uses only the supplied native GH_TOKEN.
 *
 * @internal
 */
export async function requestMergedVerification(context, dependencies = {}) {
    if (
        !['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName) ||
        context?.repository !== repository ||
        ![repositoryId, String(repositoryId)].includes(context?.repositoryId) ||
        typeof context?.sourceSha !== 'string' ||
        !shaPattern.test(context?.sourceSha ?? '')
    ) throw new Error(requestFailure);

    const sourceSha = context.sourceSha;
    const boundary = dependencies.request ?? requestDependabotGitHub;
    const request = async(method, endpoint, body) => {
        try {
            return await boundary(method, endpoint, body);
        } catch {
            throw new Error(requestFailure);
        }
    };
    const metadata = await request('GET', `repositories/${repositoryId}`);

    if (
        !canonicalRepository(metadata) ||
        metadata.default_branch !== 'main' ||
        metadata.private !== false ||
        metadata.fork !== false
    ) throw new Error(requestFailure);

    const mainPath = `${repositoryPath}/branches/main`;
    const main = await request('GET', mainPath);

    if (main?.name !== 'main' || !shaPattern.test(main?.commit?.sha ?? '')) throw new Error(requestFailure);

    if (main.commit.sha !== sourceSha) return { status: 'superseded',
        sourceSha };

    const workflow = await request('GET', `${repositoryPath}/actions/workflows/ci.yml`);

    if (
        !Number.isSafeInteger(workflow?.id) ||
        workflow.id <= 0 ||
        workflow.path !== workflowPath ||
        workflow.name !== workflowName ||
        workflow.state !== 'active'
    ) throw new Error(requestFailure);

    const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflow.id}`;
    const runs = await request('GET', `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`);

    if (
        !Number.isSafeInteger(runs?.total_count) ||
        runs.total_count < 0 ||
        runs.total_count > 100 ||
        !Array.isArray(runs.workflow_runs) ||
        runs.workflow_runs.length > 100 ||
        runs.workflow_runs.length !== runs.total_count ||
        (runs.total_count > 0 && runs.workflow_runs.length === 0) ||
        runs.workflow_runs.some(
            (run) => !Number.isSafeInteger(run?.id) ||
              run.id <= 0 ||
          !Number.isSafeInteger(run.run_attempt) ||
          run.run_attempt <= 0
        )
    ) throw new Error(requestFailure);

    const existingRun = runs.workflow_runs.find((run) => canonicalRun(run, workflow.id, sourceSha));
    if (existingRun) return { status: 'already-requested',
        sourceSha,
        runId: existingRun.id };

    const currentMain = await request('GET', mainPath);

    if (currentMain?.name !== 'main' || !shaPattern.test(currentMain?.commit?.sha ?? '')) throw new Error(requestFailure);

    if (currentMain.commit.sha !== sourceSha) return { status: 'superseded',
        sourceSha };

    await request('POST', `${workflowEndpoint}/dispatches`, {
        ref: 'main',
        inputs: { expected_head_sha: sourceSha }
    });

    return { status: 'requested',
        sourceSha };
}

function canonicalRepository(value) {
    return value?.id === repositoryId && value?.full_name === repository;
}

function canonicalRun(run, workflowId, sourceSha) {
    return (
        Number.isSafeInteger(run?.id) &&
        run.id > 0 &&
        Number.isSafeInteger(run.run_attempt) &&
        run.run_attempt > 0 &&
        run.workflow_id === workflowId &&
        run.head_sha === sourceSha &&
        run.head_branch === 'main' &&
        ['push', 'workflow_dispatch'].includes(run.event) &&
        typeof run.path === 'string' &&
        (run.path === workflowPath || run.path.startsWith(`${workflowPath}@`)) &&
    canonicalRepository(run.repository) &&
    canonicalRepository(run.head_repository)
    );
}
