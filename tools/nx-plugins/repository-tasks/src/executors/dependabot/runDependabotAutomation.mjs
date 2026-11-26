// #region Imports

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeDependabotPullRequest } from './mergeDependabotPullRequest.mjs';
import { reconcileDependabotBranches } from './reconcileDependabotBranches.mjs';
import { requestMergedRelease } from './requestMergedRelease.mjs';
import { requestMergedVerification } from './requestMergedVerification.mjs';

// #endregion

/**
 * Runs the Nx-owned dependency operation without loading workspace dependencies.
 *
 * @param mode - The explicit operation supplied by Nx or the trusted workflow.
 * @returns The credential-free workflow outcome.
 * @throws An Error for an unsupported mode or failed verified operation.
 * @remarks The native-Node workflow boundary uses this same implementation from the default branch.
 * @internal
 */
export async function runDependabotAutomation(mode) {
  const context = {
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    repositoryId: process.env.GITHUB_REPOSITORY_ID,
    defaultBranch: process.env.DEFAULT_BRANCH,
    runId: process.env.WORKFLOW_RUN_ID,
    runAttempt: process.env.WORKFLOW_RUN_ATTEMPT,
    sourceSha: process.env.MERGE_COMMIT_SHA,
  };
  let result;
  switch (mode) {
    case 'merge':
      result = await mergeDependabotPullRequest(context);
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `merged=${result.status === 'merged'}\n${result.status === 'merged' ? `merge_sha=${result.sha}\ndefault_branch=${result.defaultBranch}\n` : ''}`,
          'utf8',
        );
      break;
    case 'reconcile':
      result = { status: 'reconciled', results: await reconcileDependabotBranches(context) };
      break;
    case 'continue':
      result = {
        verification: await requestMergedVerification(context),
        release: await requestMergedRelease(context),
      };
      break;
    default:
      throw new Error('Unsupported dependency workflow operation.');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Unexpected dependency workflow arguments.');
    await runDependabotAutomation(process.env.DEPENDABOT_MODE);
  } catch {
    process.stderr.write('Dependency automation failed; inspect the workflow and pull request.\n');
    process.exitCode = 1;
  }
}
