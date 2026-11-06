// #region Imports

import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

// #endregion

/**
 * The tabs of the test lab with what the page says on each.
 */
const TABS = [
  {
    id: 'translation',
    label: 'Translation',
    route: '/test-lab/translation',
    lead: 'Try a translation before you run it. Nothing here writes to your project.',
  },
  {
    id: 'detector',
    label: 'Detector',
    route: '/test-lab/detector',
    lead: 'Paste code and see what the detector would find. Nothing here writes to your project.',
  },
  {
    id: 'patterns',
    label: 'Key patterns',
    route: '/test-lab/patterns',
    lead: 'Check which keys a pattern covers before you declare it. Nothing here writes to your project.',
  },
] as const;

/**
 * Owns the frame of the test lab: which tab is open.
 */
@Injectable()
export class TestLabLayoutViewPresenter {
  // #region Fields

  private readonly _router = inject(Router);
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
   * Gets the tabs with the open one.
   *
   * @readonly
   */
  public readonly tabs = computed(() =>
    TABS.map((tab) => ({ ...tab, isSelected: this._url().startsWith(tab.route) })),
  );

  /**
   * Gets what the page says on the open tab.
   *
   * @readonly
   */
  public readonly lead = computed(
    () => this.tabs().find((tab) => tab.isSelected)?.lead ?? TABS[1].lead,
  );

  // #endregion

  // #region Methods

  /**
   * Opens a tab.
   *
   * @param route The route of the tab.
   * @returns When it is open.
   */
  public async open(route: string): Promise<void> {
    await this._router.navigateByUrl(route);
  }

  // #endregion
}
