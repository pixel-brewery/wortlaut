// #region Imports

import { InjectionToken } from '@angular/core';
import type { IShellNavigationGroup } from './IShellNavigation';

// #endregion

/**
 * The sidebar of the app, which the application root composes from the routes of its features.
 *
 * @public
 */
export const SHELL_NAVIGATION = new InjectionToken<ReadonlyArray<IShellNavigationGroup>>(
  'SHELL_NAVIGATION',
);
