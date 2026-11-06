// #region Imports

import type { Routes } from '@angular/router';
import { workspaceOpenGuard } from '@pixel-brewery/wortlaut-frontend-core';
import { analyzeRoutes } from '@pixel-brewery/wortlaut-frontend-feature-analyze';
import { connectRoutes } from '@pixel-brewery/wortlaut-frontend-feature-connect';
import { detectRoutes } from '@pixel-brewery/wortlaut-frontend-feature-detect';
import { generateRoutes } from '@pixel-brewery/wortlaut-frontend-feature-generate';
import { overviewRoutes } from '@pixel-brewery/wortlaut-frontend-feature-overview';
import { reviewRoutes } from '@pixel-brewery/wortlaut-frontend-feature-review';
import { rulesRoutes } from '@pixel-brewery/wortlaut-frontend-feature-rules';
import { runsRoutes } from '@pixel-brewery/wortlaut-frontend-feature-runs';
import { settingsRoutes } from '@pixel-brewery/wortlaut-frontend-feature-settings';
import { startRoutes } from '@pixel-brewery/wortlaut-frontend-feature-start';
import { testLabRoutes } from '@pixel-brewery/wortlaut-frontend-feature-test-lab';
import { transformRoutes } from '@pixel-brewery/wortlaut-frontend-feature-transform';
import { translationsRoutes } from '@pixel-brewery/wortlaut-frontend-feature-translations';
import {
  projectsRoutes,
  workspacesRoutes,
} from '@pixel-brewery/wortlaut-frontend-feature-workspaces';
import { shellRoute } from '@pixel-brewery/wortlaut-frontend-shell';

// #endregion

/**
 * The routes of the app. Welcome, Project setup and Workspaces stand outside the shell. A sidebar entry whose feature is
 * not built yet shows that plainly.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'welcome' },
  ...startRoutes,
  ...workspacesRoutes,
  {
    ...shellRoute,
    canActivate: [workspaceOpenGuard],
    children: [
      ...projectsRoutes,
      ...overviewRoutes,
      ...translationsRoutes,
      ...detectRoutes,
      ...analyzeRoutes,
      ...generateRoutes,
      ...transformRoutes,
      ...reviewRoutes,
      ...rulesRoutes,
      ...testLabRoutes(),
      ...runsRoutes,
      ...connectRoutes,
      ...settingsRoutes(),
    ],
  },
  { path: '**', redirectTo: 'welcome' },
];
