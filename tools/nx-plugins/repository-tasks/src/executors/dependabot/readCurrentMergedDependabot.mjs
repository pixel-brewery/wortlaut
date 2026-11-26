// #region Imports
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { requireMergeProtection } from './requireMergeProtection.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';
// #endregion

/**
 * Recovers the exact current bot merge when a previous continuation lost its job output.
 *
 * @param context - The trusted scheduled, explicit or workflow controller context.
 * @param dependencies - The bounded GitHub request boundary.
 * @returns One confirmed current merged source, or undefined for another main revision.
 * @remarks REST commit associations omit the full merged boolean; the separately loaded full PR must explicitly confirm the merge. No release is dispatched here.
 * @internal
 */
export async function readCurrentMergedDependabot(context, dependencies = {}) {
    if (!['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName)) return;
    const request = dependencies.request ?? requestDependabotGitHub;
    const identity = await resolveDependabotRepository(context, request);
    if (!identity) return;
    const prefix = identity.path;
    const main = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
    const source = main?.commit?.sha;
    if (main?.name !== identity.defaultBranch || !(/^[a-f0-9]{40}$/u).test(source ?? '')) return;
    const values = await request('GET', `${prefix}/commits/${source}/pulls?per_page=100`);
    if (!Array.isArray(values) || values.length >= 100) throw new Error('The current merge association is incomplete.');
    const candidates = values.filter((pull) => eligible(pull) && pull.merged !== false);
    if (candidates.length !== 1) return;
    const pull = await request('GET', `${prefix}/pulls/${candidates[0].number}`);
    if (
        pull?.number !== candidates[0].number ||
        !eligible(pull) ||
        pull.merged !== true ||
        !await requireMergeProtection(request, prefix)
    ) return;
    const current = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
    if (current?.name === identity.defaultBranch && current.commit?.sha === source) return { number: pull.number,
        sha: source };

    function eligible(pull) {
        const repo = (value) => value?.id === identity.id && value.full_name === identity.fullName;
        return (
            Number.isSafeInteger(pull?.number) &&
            pull.number > 0 &&
            pull.state === 'closed' &&
            pull.draft === false &&
            typeof pull.merged_at === 'string' &&
            Number.isFinite(Date.parse(pull.merged_at)) &&
            pull.merge_commit_sha === source &&
            pull.user?.id === 49699333 &&
            pull.user.login === 'dependabot[bot]' &&
            pull.user.type === 'Bot' &&
      repo(pull.head?.repo) &&
      repo(pull.base?.repo) &&
      pull.base.ref === identity.defaultBranch &&
      (/^[a-f0-9]{40}$/u).test(pull.head.sha ?? '') &&
      (/^dependabot\/[a-zA-Z0-9_./-]+$/u).test(pull.head.ref ?? '') &&
      !pull.head.ref.includes('..') &&
      !pull.head.ref.includes('//')
        );
    }
}
