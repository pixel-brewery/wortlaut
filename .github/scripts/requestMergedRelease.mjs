// #region Imports

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// #endregion

const repository = 'pixel-brewery/wortlaut';
const repositoryId = 1442982809;
const workflowName = 'Continuous Desktop Release';
const workflowPath = '.github/workflows/release.yml';
const repositoryPath = `repos/${repository}`;
const shaPattern = /^[0-9a-f]{40}$/u;
const requestFailure =
  'Release request failed; inspect the original merge and release runs before retrying.';

/**
 * Requests a source-bound release after a successful native-token dependency merge.
 *
 * @param context - The trusted workflow event, immutable repository identity and exact merge source.
 * @param dependencies - An optional request(method, endpoint, body) boundary for offline verification.
 * @returns The requested, already-requested or superseded source result.
 * @throws An Error with a controlled diagnostic for invalid metadata, credentials or failed requests.
 * @remarks Existing failed or cancelled release attempts are recovered in their original run; this owner never creates a second candidate for the same observed attempt. It checks out no PR code, performs no merge or publication, and uses only the supplied native GH_TOKEN.
 *
 * @internal
 */
export async function requestMergedRelease(context, dependencies = {}) {
  if (
    context?.eventName !== 'workflow_run' ||
    context?.repository !== repository ||
    ![repositoryId, String(repositoryId)].includes(context?.repositoryId) ||
    typeof context?.sourceSha !== 'string' ||
    !shaPattern.test(context?.sourceSha ?? '')
  )
    throw new Error(requestFailure);

  const sourceSha = context.sourceSha;
  const boundary = dependencies.request ?? requestGitHub;
  const request = async (method, endpoint, body) => {
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
  )
    throw new Error(requestFailure);

  const mainPath = `${repositoryPath}/branches/main`;
  const main = await request('GET', mainPath);

  if (main?.name !== 'main' || !shaPattern.test(main?.commit?.sha ?? ''))
    throw new Error(requestFailure);

  if (main.commit.sha !== sourceSha) return { status: 'superseded', sourceSha };

  const workflow = await request('GET', `${repositoryPath}/actions/workflows/release.yml`);

  if (
    !Number.isSafeInteger(workflow?.id) ||
    workflow.id <= 0 ||
    workflow.path !== workflowPath ||
    workflow.name !== workflowName ||
    workflow.state !== 'active'
  )
    throw new Error(requestFailure);

  const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflow.id}`;
  const runs = await request('GET', `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`);

  if (
    !Number.isSafeInteger(runs?.total_count) ||
    runs.total_count < 0 ||
    !Array.isArray(runs.workflow_runs) ||
    runs.workflow_runs.length > 100 ||
    runs.workflow_runs.length > runs.total_count ||
    (runs.total_count > 0 && runs.workflow_runs.length === 0) ||
    runs.workflow_runs.some((run) => !canonicalRun(run, workflow.id, sourceSha))
  )
    throw new Error(requestFailure);

  if (runs.total_count > 0)
    return { status: 'already-requested', sourceSha, runId: runs.workflow_runs[0].id };

  const currentMain = await request('GET', mainPath);

  if (currentMain?.name !== 'main' || !shaPattern.test(currentMain?.commit?.sha ?? ''))
    throw new Error(requestFailure);

  if (currentMain.commit.sha !== sourceSha) return { status: 'superseded', sourceSha };

  await request('POST', `${workflowEndpoint}/dispatches`, {
    ref: 'main',
    inputs: { specifier: 'patch', source_sha: sourceSha },
  });

  return { status: 'requested', sourceSha };
}

function canonicalRepository(value) {
  return value?.id === repositoryId && value?.full_name === repository;
}

function canonicalRun(run, workflowId, sourceSha) {
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
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

function requestGitHub(method, endpoint, body) {
  if (!process.env.GH_TOKEN) throw new Error(requestFailure);

  const output = execFileSync(
    'gh',
    [
      'api',
      '--hostname',
      'github.com',
      '--method',
      method,
      '--header',
      'Accept: application/vnd.github+json',
      '--header',
      'X-GitHub-Api-Version: 2022-11-28',
      endpoint,
      ...(body === undefined ? [] : ['--input', '-']),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      input: body === undefined ? undefined : JSON.stringify(body),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  return output.trim() ? JSON.parse(output) : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error(requestFailure);

    const result = await requestMergedRelease({
      eventName: process.env.GITHUB_EVENT_NAME,
      repository: process.env.GITHUB_REPOSITORY,
      repositoryId: process.env.GITHUB_REPOSITORY_ID,
      sourceSha: process.env.MERGE_COMMIT_SHA,
    });

    console.log(JSON.stringify(result));
  } catch {
    console.error(requestFailure);
    process.exitCode = 1;
  }
}
