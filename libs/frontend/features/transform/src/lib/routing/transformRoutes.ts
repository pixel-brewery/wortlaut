// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Converting catalogs and sorting their keys.
 *
 * @public
 */
export const transformRoutes: Routes = [
    {
        path: 'transform',
        title: 'Transform and sort · Wortlaut',
        loadComponent: () => import('../views/TransformView').then((module) => module.TransformView)
    }
];
