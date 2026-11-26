// #region Imports
import { isCanonicalPullRequest } from './isCanonicalPullRequest.mjs';
// #endregion

/**
 * Rechecks all live source refs immediately before a native approval or protected merge.
 *
 * @param identity - The independently resolved repository identity.
 * @param pull - The originally verified full pull request.
 * @param proof - Its exact immutable M/B/C source proof.
 * @param request - The bounded GitHub metadata boundary.
 * @param kind - The dependency or source-bound metadata owner.
 * @returns The current full pull request only while every source ref still matches.
 * @internal
 */
export async function readCurrentPullRequestSource(
    identity,
    pull,
    proof,
    request,
    kind = 'dependabot'
) {
    const prefix = identity.path;
    const current = await request('GET', `${prefix}/pulls/${pull.number}`);
    if (
        current?.number !== pull.number ||
        !isCanonicalPullRequest(current, identity, kind) ||
        current.base.sha !== proof.M ||
        current.head.sha !== proof.B ||
        current.head.ref !== pull.head.ref ||
        current.merge_commit_sha !== proof.C ||
        current.mergeable !== true
    ) return;
    const main = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
    const branch = await request('GET', `${prefix}/git/ref/heads/${current.head.ref}`);
    const merge = await request('GET', `${prefix}/git/ref/pull/${current.number}/merge`);
    if (
        main?.commit?.sha === proof.M &&
        branch?.object?.type === 'commit' &&
        branch.object.sha === proof.B &&
        merge?.object?.type === 'commit' &&
        merge.object.sha === proof.C
    ) return current;
}
