/**
 * An entry of the sidebar.
 *
 * @public
 */
export interface IShellNavigationItem {
    label: string;
    icon: string;
    route: string;

    /**
     * The route that makes this entry the active one, with everything below it.
     */
    match: string;

    /**
     * Shows how many change sets wait in Review.
     */
    showsPendingChanges?: boolean;

    /**
     * The view is about the workspace, so the title bar shows no project there.
     */
    isAboutWorkspace?: boolean;
}

/**
 * A group of the sidebar.
 *
 * @public
 */
export interface IShellNavigationGroup {
    label: string;

    /**
     * Whether the entries wait for an open project.
     */
    needsProject: boolean;

    items: ReadonlyArray<IShellNavigationItem>;
}
