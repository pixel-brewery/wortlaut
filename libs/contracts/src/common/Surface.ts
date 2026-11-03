// #region Imports

import { z } from 'zod';

// #endregion

/**
 * The surface that started a run. `api` is `run()` called outside of Nx.
 *
 * @public
 */
export const SurfaceSchema = z.enum(['cli', 'nx', 'api', 'desktop', 'mcp']);

/**
 * @public
 */
export type Surface = z.output<typeof SurfaceSchema>;
