// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * The list of workspaces, outside the shell.
 *
 * @public
 */
export const workspacesRoutes: Routes = [
  {
    path: 'workspaces',
    title: 'Workspaces · Wortlaut',
    loadComponent: () => import('../views/WorkspacesView').then((module) => module.WorkspacesView),
  },
];

/**
 * The projects of the open workspace, inside the shell.
 *
 * @public
 */
export const projectsRoutes: Routes = [
  {
    path: 'projects',
    title: 'Projects · Wortlaut',
    loadComponent: () => import('../views/ProjectsView').then((module) => module.ProjectsView),
  },
];
