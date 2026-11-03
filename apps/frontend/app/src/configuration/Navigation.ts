// #region Imports

import type { IShellNavigationGroup } from '@pixel-brewery/wortlaut-frontend-shell';

// #endregion

/**
 * The sidebar: every entry points at a route owned by one feature. Project, command and verify items wait for an open
 * project.
 */
export const navigation: ReadonlyArray<IShellNavigationGroup> = [
    {
        label: 'Workspace',
        needsProject: false,
        items: [
            { label: 'Projects', icon: 'folder', route: '/projects', match: '/projects' },
            { label: 'Rule packs', icon: 'skills', route: '/rule-packs', match: '/rule-packs', isAboutWorkspace: true },
            { label: 'Review', icon: 'review', route: '/review', match: '/review', showsPendingChanges: true }
        ]
    },
    {
        label: 'Project',
        needsProject: true,
        items: [
            { label: 'Overview', icon: 'homeOutline', route: '/overview', match: '/overview' },
            { label: 'Translations', icon: 'comment', route: '/translations', match: '/translations' }
        ]
    },
    {
        label: 'Commands',
        needsProject: true,
        items: [
            { label: 'Detect', icon: 'search', route: '/detect', match: '/detect' },
            { label: 'Analyze', icon: 'clipboardTask', route: '/analyze', match: '/analyze' },
            { label: 'Generate', icon: 'sparkle', route: '/generate', match: '/generate' },
            { label: 'Transform and sort', icon: 'sync', route: '/transform', match: '/transform' }
        ]
    },
    {
        label: 'Verify',
        needsProject: true,
        items: [
            { label: 'Test lab', icon: 'executionOutline', route: '/test-lab/detector', match: '/test-lab' },
            { label: 'Runs', icon: 'flow', route: '/runs', match: '/runs' }
        ]
    },
    {
        label: 'Connect',
        needsProject: false,
        items: [
            { label: 'MCP and plugins', icon: 'bot', route: '/mcp', match: '/mcp', isAboutWorkspace: true },
            { label: 'CLI and Nx', icon: 'open', route: '/cli-nx', match: '/cli-nx' }
        ]
    }
];
