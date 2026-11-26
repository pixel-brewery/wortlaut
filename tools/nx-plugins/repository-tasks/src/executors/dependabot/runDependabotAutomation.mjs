// #region Imports

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authorizePullRequestWorkflows } from './authorizePullRequestWorkflows.mjs';
import { mergeDependabotPullRequest } from './mergeDependabotPullRequest.mjs';
import { readCurrentMergedDependabot } from './readCurrentMergedDependabot.mjs';
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
        sourceSha: process.env.MERGE_COMMIT_SHA
    };
    if (
        ['workflow_run', 'workflow_dispatch', 'schedule'].includes(context.eventName) &&
        process.env.GITHUB_REF !== 'refs/heads/main'
    ) throw new Error('Privileged automation runs only from the default branch.');
    let result;
    switch (mode) {
        case 'authorize': {
            const results = await authorizePullRequestWorkflows(context);
            if (results.some((value) => value.status === 'blocked')) throw new Error(
                `Native CI authorization stopped for pull requests: ${results
                    .filter((value) => value.status === 'blocked')
                    .map((value) => value.number)
                    .join(', ')}.`
            );
            result = { status: 'authorization-checked',
                results };
            break;
        }
        case 'merge':
            result = await mergeDependabotPullRequest(context);
            if (process.env.GITHUB_OUTPUT) appendFileSync(
                process.env.GITHUB_OUTPUT,
                `merged=${result.status === 'merged'}\n${result.status === 'merged' ? `merge_sha=${result.sha}\ndefault_branch=${result.defaultBranch}\n` : ''}`,
                'utf8'
            );
            break;
        case 'reconcile': {
            const results = await reconcileDependabotBranches(context);
            if (!results.some((value) => value.status === 'merged')) {
                const retained = await readCurrentMergedDependabot(context);
                if (retained) results.push({ status: 'continuation-pending',
                    ...retained });
            }
            const confirmed = results
                .filter((value) => ['merged', 'continuation-pending'].includes(value.status))
                .at(-1);
            if (confirmed?.sha && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `merge_sha=${confirmed.sha}\n`, 'utf8');
            result = { status: 'reconciled',
                results };
            break;
        }
        case 'continue': {
            const sources = [context.sourceSha, process.env.RECONCILE_MERGE_SHA].filter((value) => (/^[a-f0-9]{40}$/u).test(value ?? ''));
            if (sources.length === 0) throw new Error('Continuation requires a confirmed merge source.');
            const current = await readCurrentMergedDependabot(context);
            if (!current) {
                result = { status: 'skipped',
                    reason: 'unconfirmed-merged-source' };
                break;
            }
            if (!sources.includes(current.sha)) {
                result = { status: 'superseded',
                    sourceSha: sources[0] };
                break;
            }
            context.sourceSha = current.sha;
            result = {
                verification: await requestMergedVerification(context),
                release: await requestMergedRelease(context)
            };
            break;
        }
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
