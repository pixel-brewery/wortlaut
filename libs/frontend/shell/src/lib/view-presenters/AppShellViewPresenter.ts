// #region Imports

import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { RunCenter, ShellSession, ShortcutCenter } from '@pixel-brewery/wortlaut-frontend-core';
import { filter, map } from 'rxjs';
import { SHELL_NAVIGATION } from '../contracts/shellTokens';

// #endregion

/**
 * Owns what the title bar and the sidebar show: the open workspace and project and the active route.
 */
@Injectable()
export class AppShellViewPresenter {
  // #region Fields

  private readonly _router = inject(Router);
  private readonly _groups = inject(SHELL_NAVIGATION);
  private readonly _runs = inject(RunCenter);
  private readonly _shortcuts = inject(ShortcutCenter);
  private readonly _url = toSignal(
    this._router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this._router.url),
    ),
    { initialValue: this._router.url },
  );

  // #endregion

  // #region Properties

  /**
   * Gets the session of the app.
   *
   * @readonly
   */
  public readonly session = inject(ShellSession);

  /**
   * Gets the groups of the sidebar with the active item. Project, command and verify items wait for an open project.
   *
   * @readonly
   */
  public readonly navigation = computed(() => {
    const path = this._url().split('?')[0];
    const hasProject = this.session.project() !== null;

    return this._groups.map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({
        label: item.label,
        icon: item.icon,
        route: item.route,
        isActive: path === item.match || path.startsWith(`${item.match}/`),
        disabled: group.needsProject && !hasProject,
        count: item.showsPendingChanges ? this.session.pendingChanges() : 0,
      })),
    }));
  });

  /**
   * Gets the project of the title bar: none on a view about the whole workspace, although it stays open.
   *
   * @readonly
   */
  public readonly project = computed(() => {
    const path = this._url().split('?')[0];
    const isAboutWorkspace = this._groups.some((group) =>
      group.items.some(
        (item) =>
          item.isAboutWorkspace && (path === item.match || path.startsWith(`${item.match}/`)),
      ),
    );

    return isAboutWorkspace ? null : this.session.project();
  });

  /**
   * Gets whether the settings item is the active one.
   *
   * @readonly
   */
  public readonly settingsActive = computed(() => this._url().startsWith('/settings'));

  /**
   * Gets the sidebar footer with the real version.
   *
   * @readonly
   */
  public readonly versionLabel = computed(() => {
    const info = this.session.info();

    return info ? `${info.name} ${info.version}` : '';
  });

  // #endregion

  // #region Methods

  /**
   * Loads what the frame shows.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    this._shortcuts.connect();
    await Promise.all([this.session.refresh(), this.session.loadInfo(), this._runs.connect()]);
  }

  // #endregion
}
