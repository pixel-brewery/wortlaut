// #region Imports

import { DestroyRef, inject, Injectable, signal, effect } from '@angular/core';
import { ThemeService } from '@pixel-brewery/mosaik-elements-angular';

// #endregion

/**
 * Applies Soho in the color mode of the system and follows when it changes.
 */
@Injectable({ providedIn: 'root' })
export class ThemeModeStore {
  // #region Fields

  private readonly _theme = inject(ThemeService);
  private readonly _media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly _dark = signal(this._media.matches);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ThemeModeStore` class.
   */
  public constructor() {
    const changed = (event: MediaQueryListEvent): void => {
      this._dark.set(event.matches);
    };

    this._media.addEventListener('change', changed);
    inject(DestroyRef).onDestroy(() => {
      this._media.removeEventListener('change', changed);
    });
    effect(() => {
      const mode = this._dark() ? 'dark' : 'light';

      this._theme.applyTheme(mode);
      document.documentElement.style.colorScheme = mode;
      document.documentElement.dataset['appearance'] = mode;
    });
  }

  // #endregion
}
