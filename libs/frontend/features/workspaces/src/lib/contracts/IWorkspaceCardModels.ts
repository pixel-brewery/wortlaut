/**
 * A fact of a workspace card.
 */
export interface IWorkspaceFact {
  label: string;
  value: string;
}

/**
 * A tag of a workspace card.
 */
export interface IWorkspaceTag {
  label: string;
  variant: 'neutral' | 'info' | 'warning' | 'danger';
}
