// #region Imports

import type { Routes } from '@angular/router';

// #endregion

/**
 * How Wortlaut connects to everything outside the app.
 *
 * @public
 */
export const connectRoutes: Routes = [
    {
        path: 'mcp',
        title: 'MCP and plugins · Wortlaut',
        loadComponent: () => import('../views/McpView').then((module) => module.McpView)
    },
    {
        path: 'cli-nx',
        title: 'CLI and Nx · Wortlaut',
        loadComponent: () => import('../views/CliNxView').then((module) => module.CliNxView)
    }
];
