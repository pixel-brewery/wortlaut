// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * The change sets that wait for a decision.
 *
 * @public
 */
export const reviewRoutes: Routes = [
  {
    path: 'review',
    title: 'Review · Wortlaut',
    loadComponent: () => import('../views/ReviewView').then((module) => module.ReviewView),
  },
];
