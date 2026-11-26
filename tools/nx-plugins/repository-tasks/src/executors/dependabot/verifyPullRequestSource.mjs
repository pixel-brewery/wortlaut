// #region Imports
import { createHash } from 'node:crypto';
import { isCanonicalPullRequest } from './isCanonicalPullRequest.mjs';
import { isReadonlyPullRequestWorkflow } from './isReadonlyPullRequestWorkflow.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const sha = /^[a-f0-9]{40}$/u;

/**
 * Binds a read-only workflow to the exact current main, bot head and real test-merge ref.
 *
 * @param identity - The independently resolved canonical repository identity.
 * @param workflow - The fixed active CI workflow.
 * @param pull - Fresh full pull-request metadata.
 * @param request - The bounded native GitHub metadata boundary.
 * @param kind - The dependency or source-bound metadata owner.
 * @returns The immutable M/B/C source proof, or undefined when any prerequisite changed.
 * @remarks Matches the canonical Cursor source proof. Executes no PR code, reusable workflow, dependency or artifact.
 * @internal
 */
export async function verifyPullRequestSource(
    identity,
    workflow,
    pull,
    request,
    kind = 'dependabot'
) {
    if (!isCanonicalPullRequest(pull, identity, kind)) return;
    const prefix = identity.path;
    const main = await request('GET', `${prefix}/branches/${identity.defaultBranch}`);
    const M = main?.commit?.sha;
    const B = pull.head.sha;
    const C = pull.merge_commit_sha;
    if (
        main?.name !== identity.defaultBranch ||
        !sha.test(M ?? '') ||
        pull.base.sha !== M ||
        !sha.test(C ?? '') ||
        pull.mergeable !== true
    ) return;
    const branch = await request('GET', `${prefix}/git/ref/heads/${pull.head.ref}`);
    const mergeRef = await request('GET', `${prefix}/git/ref/pull/${pull.number}/merge`);
    if (
        branch?.object?.type !== 'commit' ||
        branch.object.sha !== B ||
        mergeRef?.object?.type !== 'commit' ||
        mergeRef.object.sha !== C
    ) return;
    const comparison = await request('GET', `${prefix}/compare/${M}...${B}`);
    if (comparison?.behind_by !== 0 || comparison.merge_base_commit?.sha !== M) return;
    const candidate = await request('GET', `${prefix}/git/commits/${B}`);
    const merge = await request('GET', `${prefix}/git/commits/${C}`);
    if (
        candidate?.sha !== B ||
        merge?.sha !== C ||
        merge.parents?.length !== 2 ||
        merge.parents[0].sha !== M ||
        merge.parents[1].sha !== B ||
        !sha.test(candidate.tree?.sha ?? '') ||
        merge.tree?.sha !== candidate.tree.sha
    ) return;
    const baseline = await workflowSource(M);
    const proposed = await workflowSource(B);
    if (
        !baseline ||
        !proposed ||
        !isReadonlyPullRequestWorkflow(baseline, proposed, verificationPolicy.reviewedCiSha256)
    ) return;
    return { M,
        B,
        C };

    async function workflowSource(ref) {
        const file = await request('GET', `${prefix}/contents/${workflow.path}?ref=${ref}`);
        if (
            file?.type !== 'file' ||
            file.encoding !== 'base64' ||
            typeof file.content !== 'string' ||
            !sha.test(file.sha ?? '')
        ) return;
        const bytes = Buffer.from(file.content, 'base64');
        if (
            !bytes.length ||
            bytes.length > 65_536 ||
            createHash('sha1').update(`blob ${bytes.length}\0`)
                .update(bytes)
                .digest('hex') !== file.sha
        ) return;
        return bytes.toString('utf8');
    }
}
