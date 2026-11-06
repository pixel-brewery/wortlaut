// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * The history of runs of the open project, with a run by its id.
 *
 * @public
 */
export const runsRoutes: Routes = [
  {
    path: 'runs',
    title: 'Runs · Wortlaut',
    loadComponent: () => import('../views/RunsView').then((module) => module.RunsView),
  },
  {
    path: 'runs/:runId',
    title: 'Runs · Wortlaut',
    loadComponent: () => import('../views/RunsView').then((module) => module.RunsView),
  },
];
