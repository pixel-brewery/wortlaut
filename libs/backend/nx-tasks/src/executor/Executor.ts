// #region Imports

import { join } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { runTask, type IWortlautTaskOptions } from './ExecutorTask.js';

// #endregion

/**
 * The options of the executor. The working directory is always the project.
 *
 * @public
 */
export type WortlautExecutorOptions = Omit<IWortlautTaskOptions, 'cwd'>;

/**
 * Runs a command of Wortlaut as a target. The target fails like the command line does: for anything that kept the run from
 * finishing, and, once a repository uses severities or packs, for a rule of severity `error` and for a refused pack.
 *
 * @public
 * @param options The options of the target.
 * @param context The context of the target.
 * @returns Whether the target succeeded.
 */
export default async function runExecutor(
  options: WortlautExecutorOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  try {
    const cwd = join(
      context.root,
      context.projectsConfigurations?.projects[context.projectName ?? '']?.root ?? '',
    );
    const { gate } = await runTask({
      ...options,
      cwd,
      verbose: context.isVerbose || options.verbose,
      cache: {
        enabled: options.cache?.enabled ?? context.target?.cache ?? false,
        dirPath: join(cwd, '.cache'),
      },
      actions: {
        ...options.actions,
        transform: { types: options.actions.transform?.types ?? ['json'] },
      },
    });

    return { success: !gate || (gate.errors === 0 && gate.refusedPacks.length === 0) };
  } catch (error) {
    console.error(error);

    return { success: false };
  }
}
