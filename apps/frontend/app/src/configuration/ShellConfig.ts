// #region Imports

import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideCore } from '@pixel-brewery/wortlaut-frontend-core';
import { provideShell, SHELL_NAVIGATION } from '@pixel-brewery/wortlaut-frontend-shell';
import { provideWortlautDesign } from '@pixel-brewery/wortlaut-frontend-ui';
import { navigation } from './Navigation';
import { routes } from './Routes';

// #endregion

/**
 * The composition of the renderer. The app loads from a file, so its routes live in the hash.
 */
export const ShellConfig: ApplicationConfig = {
    providers: [
        provideCore(),
        provideRouter(routes, withHashLocation()),
        provideWortlautDesign(),
        provideShell(),
        { provide: SHELL_NAVIGATION, useValue: navigation }
    ]
};
