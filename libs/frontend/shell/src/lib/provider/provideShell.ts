// #region Imports

import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { SHELL_NAVIGATION } from '../contracts/shellTokens';

// #endregion

/**
 * Composes the frame of the app. Without a navigation from the application root the sidebar stays empty.
 *
 * @public
 * @returns The shell's environment providers.
 */
export function provideShell(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: SHELL_NAVIGATION, useValue: [] }]);
}
