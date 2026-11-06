// #region Imports

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { run, type IRunResult } from '@pixel-brewery/wortlaut-app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runExecutor, { type WortlautExecutorOptions } from './Executor';

vi.mock('@pixel-brewery/wortlaut-app', () => ({ run: vi.fn() }));

// #endregion

describe('runExecutor', () => {
  let root: string;

  const context = (): ExecutorContext =>
    ({
      root,
      cwd: root,
      isVerbose: false,
      projectName: 'shop',
      target: { executor: '@pixel-brewery/wortlaut-nx-tasks:wortlaut', cache: false },
      projectsConfigurations: { version: 2, projects: { shop: { root: 'apps/shop' } } },
    }) as unknown as ExecutorContext;

  const analyze = (extra: Partial<WortlautExecutorOptions> = {}): WortlautExecutorOptions => ({
    mode: 'analyze',
    actions: {
      detect: { resourceRoot: ['i18n'] },
      analyze: { rules: ['key-consistency'] },
      sort: { order: 'asc' },
    },
    ...extra,
  });

  function answer(result: IRunResult): void {
    vi.mocked(run).mockResolvedValue(result);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-executor-'));
    vi.mocked(run).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('runs the command of the mode in the project, with the options of detect', async () => {
    // arrange
    answer({ analyze: [] });

    // act
    await runExecutor(analyze(), context());

    // assert
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: join(root, 'apps/shop'),
        actions: { analyze: { rules: ['key-consistency'] }, detect: { resourceRoot: ['i18n'] } },
      }),
    );
  });

  it('succeeds without a gate, whatever the rules find', async () => {
    // arrange
    answer({ analyze: [] });

    // act & assert
    await expect(runExecutor(analyze(), context())).resolves.toEqual({ success: true });
  });

  it('succeeds when the gate holds only warnings', async () => {
    // arrange
    answer({ analyze: [], gate: { errors: 0, warnings: 3, refusedPacks: [] } });

    // act & assert
    await expect(runExecutor(analyze(), context())).resolves.toEqual({ success: true });
  });

  it('fails for a rule of severity error', async () => {
    // arrange
    answer({ analyze: [], gate: { errors: 1, warnings: 0, refusedPacks: [] } });

    // act & assert
    await expect(runExecutor(analyze(), context())).resolves.toEqual({ success: false });
  });

  it('fails for a refused pack, however harmless its rules are', async () => {
    // arrange
    answer({
      analyze: [],
      gate: { errors: 0, warnings: 0, refusedPacks: [{ pack: 'our-pack', reason: 'changed' }] },
    });

    // act & assert
    await expect(runExecutor(analyze(), context())).resolves.toEqual({ success: false });
  });

  it('fails without a mode, instead of reporting success without having run', async () => {
    // act
    const result = await runExecutor({ actions: {} } as WortlautExecutorOptions, context());

    // assert
    expect(result).toEqual({ success: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('fails when the .env file cannot be read', async () => {
    // act
    const result = await runExecutor(analyze({ envFile: 'missing.env' }), context());

    // assert
    expect(result).toEqual({ success: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('fails when the run fails', async () => {
    // arrange
    vi.mocked(run).mockRejectedValue(new Error('No catalog found.'));

    // act & assert
    await expect(runExecutor(analyze(), context())).resolves.toEqual({ success: false });
  });

  it('fills an option from the .env file of the project', async () => {
    // arrange
    answer({ generate: [] });
    const envFile = 'wortlaut.env';

    writeFileSync(join(root, envFile), 'WORTLAUT_SPEC_KEY=from-the-file\n');

    // act
    const result = await runExecutor(
      {
        mode: 'generate',
        envFile,
        actions: { generate: { apiKey: '{env.WORTLAUT_SPEC_KEY}' } },
      },
      {
        ...context(),
        projectsConfigurations: { version: 2, projects: { shop: { root: '' } } },
      } as ExecutorContext,
    );

    // assert
    expect(result).toEqual({ success: true });
    expect(vi.mocked(run).mock.calls[0]?.[0].actions.generate?.apiKey).toBe('from-the-file');
    delete process.env.WORTLAUT_SPEC_KEY;
  });

  it('fails when a variable that an option names is not set', async () => {
    // act
    const result = await runExecutor(
      {
        mode: 'generate',
        actions: { generate: { apiKey: '{env.WORTLAUT_SPEC_MISSING}' } },
      },
      context(),
    );

    // assert
    expect(result).toEqual({ success: false });
    expect(run).not.toHaveBeenCalled();
  });
});
