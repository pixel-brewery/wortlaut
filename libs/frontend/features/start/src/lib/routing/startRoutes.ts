// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * The start screens, outside the shell.
 *
 * @public
 */
export const startRoutes: Routes = [
    {
        path: 'welcome',
        title: 'Wortlaut',
        loadComponent: () => import('../views/WelcomeView').then((module) => module.WelcomeView)
    },
    {
        path: 'setup',
        title: 'Project setup · Wortlaut',
        loadComponent: () => import('../views/SetupView').then((module) => module.SetupView)
    }
];
