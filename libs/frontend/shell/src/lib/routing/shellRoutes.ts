// #region Imports

import type { Route } from '@angular/router';

// #endregion

/**
 * The frame of the app. It loads with the route, so its controls evaluate after the theme is applied.
 *
 * @public
 */
export const shellRoute: Route = {
    path: '',
    loadComponent: () => import('../views/AppShellView').then((module) => module.AppShellView)
};

/**
 * A route whose feature is not built yet. It says so with a true empty state instead of a screen that pretends.
 *
 * @public
 * @param path The route.
 * @param title The name of the view.
 * @param description What the view will do, and what works today.
 * @returns The route.
 */
export function notAvailableRoute(path: string, title: string, description: string): Route {
    return {
        path,
        title: `${title} · Wortlaut`,
        data: { title, description },
        loadComponent: () => import('../views/NotAvailableView').then((module) => module.NotAvailableView)
    };
}
