// cspell:ignore ngpel
const sha = /^[a-f0-9]{40}$/u;

/**
 * Identifies one actual open bot pull request in the canonical repository.
 *
 * @param pull - Fresh complete or commit-association pull-request metadata.
 * @param identity - The independently resolved fixed repository identity.
 * @param kind - The owning dependency or immutable release-metadata capability.
 * @param simple - Whether the REST association omits the full merged boolean.
 * @returns Whether author, branch, base and head belong to this exact capability.
 * @internal
 */
export function isCanonicalPullRequest(pull, identity, kind = 'dependabot', simple = false) {
    const actor =
        kind === 'dependabot'
            ? { id: 49699333,
                login: 'dependabot[bot]' }
            : kind === 'release-metadata'
                ? { id: 41898282,
                    login: 'github-actions[bot]' }
                : undefined;
    const canonical = (repo) => repo?.id === identity.id && repo.full_name === identity.fullName;
    const branch =
        kind === 'dependabot' ? /^dependabot\/[a-zA-Z0-9_./-]+$/u : /^release\/ngpel\/[a-f0-9]{40}$/u;
    return Boolean(
        actor &&
        Number.isSafeInteger(pull?.number) &&
        pull.number > 0 &&
        pull.state === 'open' &&
        pull.draft === false &&
        (simple ? pull.merged !== true && pull.merged_at == null : pull.merged === false) &&
        pull.user?.type === 'Bot' &&
        pull.user.id === actor.id &&
        pull.user.login === actor.login &&
        canonical(pull.head?.repo) &&
    canonical(pull.base?.repo) &&
    pull.base.ref === identity.defaultBranch &&
    sha.test(pull.base.sha ?? '') &&
    sha.test(pull.head.sha ?? '') &&
    branch.test(pull.head.ref ?? '') &&
    !pull.head.ref.includes('..') &&
    !pull.head.ref.includes('//')
    );
}
