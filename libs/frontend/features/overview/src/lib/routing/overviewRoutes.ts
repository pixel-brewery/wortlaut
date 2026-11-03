// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * The overview of the open project.
 *
 * @public
 */
export const overviewRoutes: Routes = [
    {
        path: 'overview',
        title: 'Overview · Wortlaut',
        loadComponent: () => import('../views/OverviewView').then((module) => module.OverviewView)
    }
];
