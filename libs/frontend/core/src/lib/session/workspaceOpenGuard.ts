// #region Imports

import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { ShellSession } from './ShellSession';

// #endregion

/**
 * Lets a view of the shell open only while a workspace is open. Main holds that state, so a reload of the renderer stays
 * where it was, and a start without a workspace goes to Welcome.
 *
 * @public
 */
export const workspaceOpenGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const session = inject(ShellSession);
  const state = await session.refresh();

  return state.workspace ? true : router.parseUrl('/welcome');
};
