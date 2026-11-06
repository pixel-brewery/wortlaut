// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Finding the hard-coded strings of the sources.
 *
 * @public
 */
export const detectRoutes: Routes = [
  {
    path: 'detect',
    title: 'Detect · Wortlaut',
    loadComponent: () => import('../views/DetectView').then((module) => module.DetectView),
  },
];
