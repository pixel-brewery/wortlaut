import { describe, expect, it, vi } from 'vitest';
import { releaseRepository } from '../../../../../../.github/scripts/releaseRepository.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';

const context = {
  repositoryId: releaseRepository.id,
  repository: releaseRepository.fullName,
  defaultBranch: 'main',
};
const metadata = {
  id: releaseRepository.id,
  name: 'wortlaut',
  full_name: releaseRepository.fullName,
  default_branch: 'main',
  fork: false,
  private: false,
  visibility: 'public',
};

describe('resolveDependabotRepository', () => {
  it('binds the current public repository to its immutable ID before bot writes', async () => {
    // Arrange
    const request = vi.fn().mockResolvedValue(metadata);
    // Act
    const result = await resolveDependabotRepository(context, request);
    // Assert
    expect(result).toEqual({
      id: releaseRepository.id,
      fullName: releaseRepository.fullName,
      defaultBranch: 'main',
      path: `repos/${releaseRepository.fullName}`,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith('GET', `repositories/${releaseRepository.id}`);
  });
  it.each([
    undefined,
    {},
    { ...context, repositoryId: 1 },
    { ...context, repository: 'outsider/wortlaut' },
    { ...context, defaultBranch: '../main' },
  ])('rejects foreign context before contacting GitHub: %j', async (input) => {
    // Arrange
    const request = vi.fn();
    // Act
    const result = await resolveDependabotRepository(input, request);
    // Assert
    expect(result).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { id: 1 },
    { private: true, visibility: 'private' },
    { fork: true },
    { full_name: 'former-owner/wortlaut' },
    { name: 'impostor' },
    { default_branch: 'dev' },
  ])('rejects an uncompleted or altered cutover: %j', async (override) => {
    // Arrange
    const request = vi.fn().mockResolvedValue({ ...metadata, ...override });
    // Act
    const result = await resolveDependabotRepository(context, request);
    // Assert
    expect(result).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
