// #region Imports

import type { IDependabotExecutorOptions } from './interfaces/IDependabotExecutorOptions.js';

// #endregion

/**
 * Adapts the Nx mode contract to the repository's trusted dependency workflow.
 *
 * @param options - The schema-validated dependency operation.
 * @returns The completed operation result.
 * @internal
 */
export default async function executor(
  options: IDependabotExecutorOptions,
): Promise<{ success: boolean }> {
  const { runDependabotAutomation } = await import('./runDependabotAutomation.mjs');
  await runDependabotAutomation(options.mode);
  return { success: true };
}
