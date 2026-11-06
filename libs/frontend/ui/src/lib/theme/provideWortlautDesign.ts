// #region Imports

import {
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import {
  provideDefaultIconSet,
  provideForms,
  provideIcons,
  provideIconSet,
  provideTheme,
} from '@pixel-brewery/mosaik-elements-angular';
import { ReiconAliases } from '@pixel-brewery/mosaik-elements-foundation/icons/reicon';
import { SohoTheme } from '@pixel-brewery/mosaik-themes';
import { ThemeModeStore } from './ThemeModeStore';
import { wortlautIcons } from './wortlautIcons';

// #endregion

/**
 * Composes Mosaik Soho in the color mode of the system, with the form integration and the icons of the app.
 *
 * @public
 * @returns The design's environment providers.
 */
export function provideWortlautDesign(): EnvironmentProviders {
  const mode = globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  return makeEnvironmentProviders([
    provideTheme({ theme: SohoTheme.SOHO_THEME, mode }),
    provideForms(),
    provideIconSet('reicon', ReiconAliases),
    provideDefaultIconSet('reicon'),
    provideIcons(wortlautIcons),
    provideEnvironmentInitializer(() => {
      inject(ThemeModeStore);
    }),
  ]);
}
