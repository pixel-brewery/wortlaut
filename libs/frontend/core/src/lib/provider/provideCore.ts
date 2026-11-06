// #region Imports

import {
  makeEnvironmentProviders,
  provideZonelessChangeDetection,
  type EnvironmentProviders,
} from '@angular/core';

// #endregion

/**
 * Composes what every view relies on.
 *
 * @public
 * @returns The core's environment providers.
 */
export function provideCore(): EnvironmentProviders {
  return makeEnvironmentProviders([provideZonelessChangeDetection()]);
}
