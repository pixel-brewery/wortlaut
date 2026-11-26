/**
 * Selects the latest actual PR CI run without allowing diagnostic dispatches to shadow it.
 *
 * @param inventory - The complete bounded workflow-run response for the exact head.
 * @param identity - The canonical repository identity.
 * @param workflow - The active fixed verification workflow.
 * @param pull - The freshly verified open pull request.
 * @returns The latest matching native run, including approval-required or failed attempts.
 * @throws An Error for incomplete or malformed inventory.
 * @remarks Run IDs stay unchanged when approval creates another attempt. Callers reload the selected run and verify its current attempt before mutation. Ordinary maintainer CI actors remain valid.
 * @internal
 */
export function readLatestPullRequestRun(inventory, identity, workflow, pull) {
    if (
        !Number.isSafeInteger(inventory?.total_count) ||
        inventory.total_count < 0 ||
        inventory.total_count > 100 ||
        !Array.isArray(inventory.workflow_runs) ||
        inventory.workflow_runs.length !== inventory.total_count
    ) throw new Error('The native verification inventory is incomplete.');
    const positive = (value) => Number.isSafeInteger(value) && value > 0;
    const canonical = (repo) => repo?.id === identity.id && repo.full_name === identity.fullName;
    return inventory.workflow_runs
        .filter((run) => {
            const linked = run?.pull_requests?.[0];
            return (
                positive(run?.id) &&
                positive(run.run_attempt) &&
                run.workflow_id === workflow.id &&
                run.name === workflow.name &&
                (run.path === workflow.path ||
                  run.path === `${workflow.path}@refs/heads/${pull.head.ref}` ||
                  run.path === `${workflow.path}@refs/pull/${pull.number}/merge`) &&
                  run.event === 'pull_request' &&
                  run.head_sha === pull.head.sha &&
                  run.head_branch === pull.head.ref &&
                  canonical(run.repository) &&
          canonical(run.head_repository) &&
          positive(run.actor?.id) &&
          typeof run.actor.login === 'string' &&
          ['Bot', 'User'].includes(run.actor.type) &&
          Array.isArray(run.pull_requests) &&
          run.pull_requests.length === 1 &&
        linked.number === pull.number &&
        linked.base?.ref === identity.defaultBranch &&
        linked.base.sha === pull.base.sha &&
        linked.base.repo?.id === identity.id &&
        linked.head?.sha === pull.head.sha &&
        linked.head.ref === pull.head.ref &&
        linked.head.repo?.id === identity.id
            );
        })
        .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
}
