// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * Browsing and editing the keys of a project.
 *
 * @public
 */
export const translationsRoutes: Routes = [
  {
    path: 'translations',
    title: 'Translations · Wortlaut',
    loadComponent: () =>
      import('../views/TranslationsView').then((module) => module.TranslationsView),
  },
];
