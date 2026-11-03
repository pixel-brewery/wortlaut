// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Running the rules on the catalogs.
 *
 * @public
 */
export const analyzeRoutes: Routes = [
    {
        path: 'analyze',
        title: 'Analyze · Wortlaut',
        loadComponent: () => import('../views/AnalyzeView').then((module) => module.AnalyzeView)
    }
];
