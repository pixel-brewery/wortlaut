// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';

// #endregion

const system = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: system.execFile }));

afterEach(() => {
  vi.unstubAllEnvs();
  system.execFile.mockReset();
});

describe('Dependabot GitHub request boundary', () => {
  it('sends JSON through stdin with the existing job token and bounded direct CLI execution', async () => {
    // arrange
    const input = vi.fn();
    const endpoint = 'repos/pixel-brewery/wortlaut/issues/7/comments';

    vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
    system.execFile.mockImplementation((_command, _arguments, _options, callback) => ({
      stdin: {
        on: vi.fn(),
        end: (body: string) => {
          input(body);
          callback(null, '{"id":7}');
        },
      },
    }));

    // act
    const result = await requestDependabotGitHub('POST', endpoint, { body: '@dependabot rebase' });

    // assert
    expect(result).toEqual({ id: 7 });
    expect(input).toHaveBeenCalledExactlyOnceWith('{"body":"@dependabot rebase"}');

    const [command, arguments_, options] = system.execFile.mock.calls[0];

    expect(command).toBe('gh');
    expect(arguments_.slice(0, 3)).toEqual(['api', '--hostname', 'github.com']);
    expect(arguments_).toContain(endpoint);
    expect(arguments_.slice(-2)).toEqual(['--input', '-']);
    expect(arguments_.join(' ')).not.toContain('synthetic-workflow-token');
    expect(arguments_).not.toContain('auth');
    expect(options).toMatchObject({
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      killSignal: 'SIGKILL',
      env: { GH_TOKEN: 'synthetic-workflow-token', GH_PROMPT_DISABLED: '1' },
    });
  });

  it('accepts the empty successful workflow-dispatch response', async () => {
    // arrange
    vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
    system.execFile.mockImplementation((_command, _arguments, _options, callback) => ({
      stdin: { on: vi.fn(), end: () => callback(null, '') },
    }));

    // act
    const result = await requestDependabotGitHub(
      'POST',
      'repos/pixel-brewery/wortlaut/actions/workflows/ci.yml/dispatches',
      { ref: 'dependabot/npm_and_yarn/frameworks' },
    );

    // assert
    expect(result).toBeUndefined();
    expect(system.execFile).toHaveBeenCalledTimes(1);
  });

  it('does not accept an empty response from a metadata read', async () => {
    // arrange
    vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
    system.execFile.mockImplementation((_command, _arguments, _options, callback) => ({
      stdin: { on: vi.fn(), end: () => callback(null, '') },
    }));

    // act
    const result = requestDependabotGitHub('GET', 'repositories/1440122208');

    // assert
    await expect(result).rejects.toThrow('GitHub API request failed');
  });

  it('requires GH_TOKEN without falling back to a stored account or another token', async () => {
    // arrange
    vi.stubEnv('GH_TOKEN', '');
    vi.stubEnv('GITHUB_TOKEN', 'synthetic-secondary-token');

    // act
    const result = requestDependabotGitHub('GET', 'repositories/1440122208');

    // assert
    await expect(result).rejects.toThrow('GitHub API request failed');
    expect(system.execFile).not.toHaveBeenCalled();
  });

  it.each(['spawn', 'command', 'json', 'stdin'])(
    'sanitizes %s failures without retrying or exposing process output',
    async (kind) => {
      // arrange
      vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
      system.execFile.mockImplementation((_command, _arguments, _options, callback) => {
        if (kind === 'spawn') throw new Error('sensitive-upstream-output');

        return {
          stdin: {
            on: (_event: string, failure: (cause: Error) => void) => {
              if (kind === 'stdin') failure(new Error('sensitive-upstream-output'));
            },
            end: () =>
              callback(
                kind === 'command' ? new Error('sensitive-upstream-output') : null,
                kind === 'json' ? 'sensitive-upstream-output' : '{}',
              ),
          },
        };
      });

      // act
      const result = requestDependabotGitHub('GET', 'repositories/1440122208');

      // assert
      await expect(result).rejects.toThrow('GitHub API request failed');
      await expect(result).rejects.not.toThrow('sensitive-upstream-output');
      expect(system.execFile).toHaveBeenCalledTimes(1);
    },
  );
});
