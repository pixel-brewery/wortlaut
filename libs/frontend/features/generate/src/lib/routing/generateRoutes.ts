// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Translating with AI: setting up a run, and following and reviewing it.
 *
 * @public
 */
export const generateRoutes: Routes = [
    {
        path: 'generate',
        title: 'Generate · Wortlaut',
        loadComponent: () => import('../views/GenerateSetupView').then((module) => module.GenerateSetupView)
    },
    {
        path: 'generate/runs/:runId',
        title: 'Generate: run and review · Wortlaut',
        loadComponent: () => import('../views/GenerateRunView').then((module) => module.GenerateRunView)
    }
];
