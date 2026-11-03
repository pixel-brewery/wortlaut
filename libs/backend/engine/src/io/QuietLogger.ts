// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';

// #endregion

/**
 * The logger of a query. Reading a project for a view is no run, so nothing it reads ends up in a log.
 *
 * @internal
 */
export const QUIET_LOGGER: ILogger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
};
