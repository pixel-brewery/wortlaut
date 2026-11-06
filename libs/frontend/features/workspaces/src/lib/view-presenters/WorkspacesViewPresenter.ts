// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type {
  FolderSelection,
  WorkspaceCard,
  WorkspaceColor,
} from '@pixel-brewery/wortlaut-contracts';
import type { IWorkspaceFact, IWorkspaceTag } from '../contracts/IWorkspaceCardModels';
import {
  AsyncValue,
  countOf,
  customWorkspaceColor,
  DesktopApi,
  formatCount,
  ShellSession,
  WORKSPACE_COLORS,
  workspaceCodeOf,
  workspaceColorValue,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

const PAGE_SIZE = 50;

/**
 * Owns the list of workspaces and the form for a new one. Creating one writes only to the user's profile.
 */
@Injectable()
export class WorkspacesViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _router = inject(Router);
  private readonly _session = inject(ShellSession);
  private readonly _model = signal({ name: '' });
  private readonly _color = signal<WorkspaceColor>('violet');
  private readonly _folder = signal<FolderSelection | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _limit = signal(PAGE_SIZE);
  private readonly _removalTarget = signal<Readonly<Pick<WorkspaceCard, 'id' | 'name'>> | null>(
    null,
  );
  private readonly _removingId = signal<string | null>(null);

  // #endregion

  // #region Properties

  /**
   * Gets the workspaces.
   *
   * @readonly
   */
  public readonly workspaces = new AsyncValue(() => this._api.request('workspace.list', {}));

  /**
   * The visible workspace cards.
   */
  public readonly cards = computed(() => (this.workspaces.value() ?? []).slice(0, this._limit()));

  /**
   * Whether more workspace cards can be shown.
   */
  public readonly hasMore = computed(() => (this.workspaces.value()?.length ?? 0) > this._limit());

  /**
   * Gets the form of a new workspace.
   *
   * @readonly
   */
  public readonly form = form(this._model, (schema) => {
    required(schema.name);
    maxLength(schema.name, 80);
  });

  /**
   * Gets the short code that follows from the name.
   *
   * @readonly
   */
  public readonly code = computed(() => workspaceCodeOf(this._model().name));

  /**
   * Gets the chosen folder.
   *
   * @readonly
   */
  public readonly folder = this._folder.asReadonly();

  /**
   * Gets the colors with the chosen one.
   *
   * @readonly
   */
  public readonly colors = computed(() =>
    WORKSPACE_COLORS.map((color) => ({ ...color, isChecked: color.id === this._color() })),
  );

  /** The current preset or custom color used to initialize the native Mosaik editor. */
  public readonly colorValue = computed(() => workspaceColorValue(this._color()));

  /** The exact workspace awaiting the second, explicit removal confirmation. */
  public readonly removalTarget = this._removalTarget.asReadonly();

  /** The workspace whose profile entry is being removed. */
  public readonly removingId = this._removingId.asReadonly();

  /** The number of workspaces currently known to this computer. */
  public readonly workspaceCount = computed(() =>
    countOf(this.workspaces.value()?.length ?? 0, 'workspace'),
  );

  /**
   * Gets whether Create workspace can run: a name that gives a code, and a folder.
   *
   * @readonly
   */
  public readonly canCreate = computed(
    () =>
      this.code().length > 0 &&
      !this.form().invalid() &&
      this._folder() !== null &&
      !this._busy() &&
      this._removingId() === null &&
      this._removalTarget() === null,
  );

  /**
   * Gets whether a request is running.
   *
   * @readonly
   */
  public readonly busy = this._busy.asReadonly();

  /**
   * Gets what went wrong with the folder or the new workspace.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Shows the next portion of workspace cards.
   */
  public showMore(): void {
    this._limit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Writes the facts of a card, from the last known state.
   *
   * @param workspace The workspace.
   * @returns The facts.
   */
  public factsOf(workspace: WorkspaceCard): Array<IWorkspaceFact> {
    return [
      {
        label: 'Projects',
        value: workspace.nxTarget
          ? `${formatCount(workspace.projectCount)} from Nx`
          : formatCount(workspace.projectCount),
      },
      { label: 'Keys', value: formatCount(workspace.keyCount) },
      {
        label: 'Locales',
        value: workspace.locales.length > 0 ? workspace.locales.join(', ') : 'None yet',
      },
      { label: 'AI', value: workspace.provider ?? 'Not set up' },
    ];
  }

  /**
   * Writes the tags of a card, from the last known state.
   *
   * @param workspace The workspace.
   * @returns The tags.
   */
  public tagsOf(workspace: WorkspaceCard): Array<IWorkspaceTag> {
    const tags: Array<IWorkspaceTag> = [{ label: 'This computer', variant: 'neutral' }];

    if (workspace.nxTarget) {
      tags.push({ label: `Nx target ${workspace.nxTarget}`, variant: 'info' });
    }

    if (workspace.folderMissing) {
      tags.push({ label: 'The folder is gone', variant: 'danger' });
    }

    if (workspace.failingProjects > 0) {
      tags.push({
        label: `${countOf(workspace.failingProjects, 'project')} with open problems`,
        variant: 'warning',
      });
    }

    return tags;
  }

  /**
   * Picks a color.
   *
   * @param id The color.
   */
  public pickColor(id: WorkspaceColor): void {
    this._color.set(id);
  }

  /**
   * Accepts only a complete, opaque RGB custom color from Mosaik's editor.
   *
   * @param value The editor output.
   */
  public pickCustomColor(value: unknown): void {
    const color = customWorkspaceColor(value);

    if (color) {
      this._color.set(color);
    }
  }

  /**
   * Opens the second confirmation only after the view's press-and-hold control completes.
   *
   * @param id The workspace selected by that control.
   */
  public requestRemoval(id: string): void {
    if (this._busy() || this._removingId() !== null || this._removalTarget() !== null) {
      return;
    }

    const workspace = this.workspaces.value()?.find((item) => item.id === id);

    if (workspace) {
      this._message.set(null);
      this._removalTarget.set({ id: workspace.id, name: workspace.name });
    }
  }

  /** Dismissing the message box never removes a workspace. */
  public cancelRemoval(): void {
    this._removalTarget.set(null);
  }

  /**
   * Removes the captured profile entry only for MessageBox's explicit positive result.
   *
   * @param result The documented MessageBox action result.
   * @returns When removal and the visible profile projection finish.
   */
  public async resolveRemoval(result: string): Promise<void> {
    const target = this._removalTarget();

    if (result !== 'ok') {
      this.cancelRemoval();
      return;
    }

    if (!target || this._busy() || this._removingId() !== null) {
      return;
    }

    this._removalTarget.set(null);
    this._removingId.set(target.id);
    this._message.set(null);

    try {
      await this._api.request('workspace.remove', { workspaceId: target.id });
      await this.workspaces.reload();
      await this._session.refresh();
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._removingId.set(null);
    }
  }

  /**
   * Opens the native dialog for the repository. A cancelled dialog keeps what was chosen before.
   *
   * @returns When it is done.
   */
  public async chooseFolder(): Promise<void> {
    this._message.set(null);

    try {
      const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

      if (folder) {
        this._folder.set(folder);
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Creates the workspace. Projects with their own configuration are ready, anything else goes to Project setup.
   *
   * @returns When it is done.
   */
  public async create(): Promise<void> {
    const folder = this._folder();

    if (!folder || !this.canCreate()) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      const created = await this._api.request('workspace.create', {
        name: this._model().name,
        code: this.code(),
        color: this._color(),
        folderToken: folder.token,
      });

      if (created.next === 'projects') {
        await this._router.navigate(['/projects']);
      } else {
        await this._router.navigate(['/setup'], {
          queryParams: { folder: folder.token, workspace: created.workspaceId },
        });
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Opens a workspace.
   *
   * @param id The workspace.
   * @returns When it is done.
   */
  public async open(id: string): Promise<void> {
    this._message.set(null);

    try {
      const { next } = await this._api.request('workspace.open', { workspaceId: id });

      await this._router.navigate([`/${next}`]);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Opens the settings of a workspace.
   *
   * @param id The workspace.
   * @returns When it is done.
   */
  public async openSettings(id: string): Promise<void> {
    this._message.set(null);

    try {
      await this._api.request('workspace.open', { workspaceId: id });
      await this._router.navigate(['/settings/workspace']);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  // #endregion
}
