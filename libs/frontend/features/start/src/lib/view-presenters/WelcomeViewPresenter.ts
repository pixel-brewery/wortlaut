// #region Imports

import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { WorkspaceRecent } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, countOf, DesktopApi, localeList } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * Owns the start screen: choosing or dropping a folder and the recent workspaces.
 */
@Injectable()
export class WelcomeViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _router = inject(Router);
  private readonly _message = signal<string | null>(null);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `WelcomeViewPresenter` class.
   */
  public constructor() {
    const stop = this._api.onEvent((event) => {
      if (event.type === 'folder.dropped') {
        void this._router.navigate(['/setup'], { queryParams: { folder: event.folder.token } });
      } else if (event.type === 'folder.dropFailed') {
        this._message.set(event.message);
      }
    });

    inject(DestroyRef).onDestroy(stop);
  }

  // #endregion

  // #region Properties

  /**
   * Gets the recent workspaces.
   *
   * @readonly
   */
  public readonly recent = new AsyncValue(() => this._api.request('workspace.recent', {}));

  /**
   * Gets what went wrong with a chosen or dropped folder.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Writes the line below a recent workspace.
   *
   * @param workspace The workspace.
   * @returns For example `1 project · 858 keys · English and German`.
   */
  public detailOf(workspace: WorkspaceRecent): string {
    if (workspace.folderMissing) {
      return 'The folder is gone';
    }

    return [
      countOf(workspace.projectCount, 'project'),
      countOf(workspace.keyCount, 'key'),
      workspace.locales.length > 0 ? localeList(workspace.locales) : 'No locales yet',
    ].join(' · ');
  }

  /**
   * Opens the native dialog and goes on to Project setup. A cancelled dialog stays here.
   *
   * @returns When it is done.
   */
  public async chooseFolder(): Promise<void> {
    this._message.set(null);

    try {
      const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

      if (folder) {
        await this._router.navigate(['/setup'], { queryParams: { folder: folder.token } });
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Opens a recent workspace: one project goes to Overview, anything else to Projects.
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

  // #endregion
}
