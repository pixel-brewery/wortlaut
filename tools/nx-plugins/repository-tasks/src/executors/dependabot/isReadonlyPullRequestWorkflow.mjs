// #region Imports
import { createHash } from 'node:crypto';
// #endregion

function pinInvariant(text) {
    return text
        .split('\n')
        .map((line) => {
            const match =
                (/^([ ]*(?:-\s+)?uses:\s+)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*)@([a-f0-9]{40})(?:[ ]+#\s*v?\d+(?:\.\d+)*(?:[.+-][a-zA-Z0-9_.-]+)?)?[ ]*$/u).exec(
                    line
                );
            return match ? `${match[1]}${match[2]}@PIN` : line;
        })
        .join('\n');
}

/**
 * Verifies exact reviewed CI identity while allowing only full action SHA pin updates.
 *
 * @param mainSource - The immutable current protected-main workflow content.
 * @param pullRequestSource - The immutable exact pull-request workflow content.
 * @param reviewedCiSha256 - The fixed digest reviewed and stored in trusted main policy.
 * @returns Whether the main digest is reviewed and the proposed normalized source is identical.
 * @remarks This is a positive review boundary, not a YAML parser. Never derive the review digest from a PR or from unreviewed runtime content.
 * @internal
 */
export function isReadonlyPullRequestWorkflow(mainSource, pullRequestSource, reviewedCiSha256) {
    if (
        typeof mainSource !== 'string' ||
        typeof pullRequestSource !== 'string' ||
        !(/^[a-f0-9]{64}$/u).test(reviewedCiSha256 ?? '')
    ) return false;
    const reviewed = pinInvariant(mainSource);
    return (
        createHash('sha256').update(reviewed, 'utf8')
            .digest('hex') === reviewedCiSha256 &&
            reviewed === pinInvariant(pullRequestSource)
    );
}
