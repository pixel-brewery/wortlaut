// #region Imports

import type { Route, Routes } from '@angular/router';

// #endregion

/**
 * The test lab: it tries translations, detectors and key patterns, and never writes to the project.
 *
 * @public
 * @param others The tabs whose feature is not built yet.
 * @returns The routes.
 */
export function testLabRoutes(others: ReadonlyArray<Route> = []): Routes {
  return [
    {
      path: 'test-lab',
      loadComponent: () =>
        import('../views/TestLabLayoutView').then((module) => module.TestLabLayoutView),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'translation' },
        {
          path: 'translation',
          title: 'Test lab: translation · Wortlaut',
          loadComponent: () =>
            import('../views/TestTranslationView').then((module) => module.TestTranslationView),
        },
        {
          path: 'detector',
          title: 'Test lab: detector · Wortlaut',
          loadComponent: () =>
            import('../views/TestDetectorView').then((module) => module.TestDetectorView),
        },
        {
          path: 'patterns',
          title: 'Test lab: key patterns · Wortlaut',
          loadComponent: () =>
            import('../views/TestPatternsView').then((module) => module.TestPatternsView),
        },
        ...others,
      ],
    },
  ];
}
