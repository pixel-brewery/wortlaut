// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Rule packs, with Add a rule pack as a dialog over it.
 *
 * @public
 */
export const rulesRoutes: Routes = [
    {
        path: 'rule-packs',
        title: 'Rule packs · Wortlaut',
        loadComponent: () => import('../views/RulePacksView').then((module) => module.RulePacksView),
        children: [
            {
                path: 'add',
                title: 'Add a rule pack · Wortlaut',
                loadComponent: () => import('../views/RulePackAddView').then((module) => module.RulePackAddView)
            }
        ]
    }
];
