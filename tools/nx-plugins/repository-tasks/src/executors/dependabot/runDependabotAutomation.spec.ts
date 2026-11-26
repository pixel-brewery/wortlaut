// #region Imports
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDependabotAutomation } from './runDependabotAutomation.mjs';
// #endregion

const boundaries = vi.hoisted(() => ({
  reconcile: vi.fn(),
  current: vi.fn(),
  workflow: vi.fn(),
  release: vi.fn(),
  append: vi.fn(),
}));
vi.mock('node:fs', () => ({ appendFileSync: boundaries.append }));
vi.mock('./reconcileDependabotBranches.mjs', () => ({
  reconcileDependabotBranches: boundaries.reconcile,
}));
vi.mock('./readCurrentMergedDependabot.mjs', () => ({
  readCurrentMergedDependabot: boundaries.current,
}));
vi.mock('./requestMergedVerification.mjs', () => ({
  requestMergedVerification: boundaries.workflow,
}));
vi.mock('./requestMergedRelease.mjs', () => ({ requestMergedRelease: boundaries.release }));
const source = 'a'.repeat(40),
  next = 'b'.repeat(40);

function environment(event = 'schedule') {
  vi.stubEnv('GITHUB_EVENT_NAME', event);
  vi.stubEnv('GITHUB_REF', 'refs/heads/main');
  vi.stubEnv('GITHUB_REPOSITORY', 'pixel-brewery/wortlaut');
  vi.stubEnv('GITHUB_REPOSITORY_ID', '1444820071');
  vi.stubEnv('DEFAULT_BRANCH', 'main');
  vi.stubEnv('GITHUB_OUTPUT', 'controlled-output');
  vi.stubEnv('MERGE_COMMIT_SHA', '');
  vi.stubEnv('RECONCILE_MERGE_SHA', '');
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  boundaries.workflow.mockResolvedValue({ status: 'requested' });
  boundaries.release.mockResolvedValue({ status: 'requested' });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Object.values(boundaries).forEach((value) => value.mockReset());
});

describe('Trusted dependency workflow entry', () => {
  it('exports a scheduled actual merge to the separate continuation job', async () => {
    // Arrange
    environment();
    boundaries.reconcile.mockResolvedValue([{ number: 7, status: 'merged', sha: source }]);
    // Act
    await runDependabotAutomation('reconcile');
    // Assert
    expect(boundaries.append).toHaveBeenCalledExactlyOnceWith(
      'controlled-output',
      `merge_sha=${source}\n`,
      'utf8',
    );
    expect(boundaries.release).not.toHaveBeenCalled();
  });

  it('recovers a confirmed current closed merge without claiming another merge', async () => {
    // Arrange
    environment();
    boundaries.reconcile.mockResolvedValue([]);
    boundaries.current.mockResolvedValue({ number: 7, sha: source });
    // Act
    const result = await runDependabotAutomation('reconcile');
    // Assert
    expect(result.results).toEqual([{ status: 'continuation-pending', number: 7, sha: source }]);
    expect(boundaries.append).toHaveBeenCalledExactlyOnceWith(
      'controlled-output',
      `merge_sha=${source}\n`,
      'utf8',
    );
  });

  it.each(['schedule', 'workflow_dispatch', 'workflow_run'])(
    'continues a retained source for trusted %s',
    async (event) => {
      // Arrange
      environment(event);
      vi.stubEnv('RECONCILE_MERGE_SHA', source);
      boundaries.current.mockResolvedValue({ number: 7, sha: source });
      // Act
      await runDependabotAutomation('continue');
      // Assert
      expect(boundaries.release).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ eventName: event, sourceSha: source }),
      );
      expect(boundaries.workflow).toHaveBeenCalledTimes(1);
    },
  );

  it('selects the current independently confirmed source from two actual merge outputs', async () => {
    // Arrange
    environment();
    vi.stubEnv('MERGE_COMMIT_SHA', source);
    vi.stubEnv('RECONCILE_MERGE_SHA', next);
    boundaries.current.mockResolvedValue({ number: 8, sha: next });
    // Act
    await runDependabotAutomation('continue');
    // Assert
    expect(boundaries.release).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sourceSha: next }),
    );
  });

  it('does not replace a superseded requested source with an unrelated current source', async () => {
    // Arrange
    environment();
    vi.stubEnv('MERGE_COMMIT_SHA', source);
    boundaries.current.mockResolvedValue({ number: 8, sha: next });
    // Act
    const result = await runDependabotAutomation('continue');
    // Assert
    expect(result).toEqual({ status: 'superseded', sourceSha: source });
    expect(boundaries.release).not.toHaveBeenCalled();
  });

  it('starts no continuation when the current full merged PR is unconfirmed', async () => {
    // Arrange
    environment();
    vi.stubEnv('MERGE_COMMIT_SHA', source);
    boundaries.current.mockResolvedValue(undefined);
    // Act
    const result = await runDependabotAutomation('continue');
    // Assert
    expect(result).toEqual({ status: 'skipped', reason: 'unconfirmed-merged-source' });
    expect(boundaries.release).not.toHaveBeenCalled();
    expect(boundaries.workflow).not.toHaveBeenCalled();
  });

  it('rejects a branch workflow before any privileged owner runs', async () => {
    // Arrange
    environment();
    vi.stubEnv('GITHUB_REF', 'refs/heads/untrusted');
    // Act
    const result = runDependabotAutomation('reconcile');
    // Assert
    await expect(result).rejects.toThrow('default branch');
    expect(boundaries.reconcile).not.toHaveBeenCalled();
  });

  it('rejects a continuation without any confirmed source', async () => {
    // Arrange
    environment();
    // Act
    const result = runDependabotAutomation('continue');
    // Assert
    await expect(result).rejects.toThrow('confirmed merge source');
    expect(boundaries.release).not.toHaveBeenCalled();
  });
});
