// #region Imports

import { releaseRepository } from './releaseRepository.mjs';

// #endregion

/**
 * Resolves the public Wortlaut repository by its immutable GitHub identity.
 *
 * @param context - The workflow's repository ID, current full name and default branch.
 * @param request - The parsed-JSON GitHub API boundary.
 * @returns The canonical repository, or undefined before the public cutover or for foreign metadata.
 * @remarks No privileged bot operation is enabled by a matching repository name alone.
 *
 * @internal
 */
export async function resolveDependabotRepository(context, request) {
  if (
    ![releaseRepository.id, String(releaseRepository.id)].includes(context?.repositoryId) ||
    context?.repository !== releaseRepository.fullName ||
    context?.defaultBranch !== releaseRepository.defaultBranch
  )
    return undefined;

  const repository = await request('GET', `repositories/${releaseRepository.id}`);

  if (
    repository?.id !== releaseRepository.id ||
    repository?.name !== releaseRepository.name ||
    repository?.full_name !== releaseRepository.fullName ||
    repository?.default_branch !== releaseRepository.defaultBranch ||
    repository?.fork !== false ||
    repository?.private !== false ||
    repository?.visibility !== 'public'
  )
    return undefined;

  return {
    id: releaseRepository.id,
    fullName: releaseRepository.fullName,
    defaultBranch: releaseRepository.defaultBranch,
    path: `repos/${releaseRepository.fullName}`,
  };
}
