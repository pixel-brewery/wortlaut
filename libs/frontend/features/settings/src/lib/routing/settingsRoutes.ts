// #region Imports

import type { Route, Routes } from '@angular/router';

// #endregion

/**
 * The settings of the open workspace and project.
 *
 * @public
 * @param others The sections of other owners, or those whose feature is not built yet.
 * @returns The routes.
 */
export function settingsRoutes(others: ReadonlyArray<Route> = []): Routes {
    return [
        {
            path: 'settings',
            loadComponent: () => import('../views/SettingsLayoutView').then((module) => module.SettingsLayoutView),
            children: [
                { path: '', pathMatch: 'full', redirectTo: 'workspace' },
                {
                    path: 'workspace',
                    title: 'Settings: workspace · Wortlaut',
                    loadComponent: () => import('../views/SettingsWorkspaceView').then((module) => module.SettingsWorkspaceView)
                },
                {
                    path: 'project',
                    title: 'Settings: project · Wortlaut',
                    loadComponent: () => import('../views/SettingsProjectView').then((module) => module.SettingsProjectView)
                },
                {
                    path: 'ai',
                    title: 'Settings: AI · Wortlaut',
                    loadComponent: () => import('../views/SettingsAiView').then((module) => module.SettingsAiView)
                },
                {
                    path: 'application',
                    title: 'Settings: application · Wortlaut',
                    loadComponent: () => import('../views/SettingsAppView').then((module) => module.SettingsAppView)
                },
                ...others
            ]
        }
    ];
}
