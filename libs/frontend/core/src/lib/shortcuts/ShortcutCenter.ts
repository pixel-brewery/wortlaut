// #region Imports

import { DestroyRef, inject, Injectable } from '@angular/core';

// #endregion

/**
 * What a shortcut does: search (⌘K), run the current command (⌘Enter), suggest with AI (⌘J) and the next open finding (⌘↓).
 *
 * @public
 */
export type ShortcutAction = 'search' | 'run' | 'suggest' | 'next';

/**
 * What a view does for each action it offers. An action it leaves out does nothing on that view.
 *
 * @public
 */
export type ShortcutHandlers = Partial<Record<ShortcutAction, () => unknown>>;

/**
 * The key of each action.
 */
const KEYS: Readonly<Record<string, ShortcutAction>> = {
  k: 'search',
  enter: 'run',
  j: 'suggest',
  arrowdown: 'next',
};

/**
 * How each action reads on a Mac and elsewhere.
 */
const LABELS: Readonly<Record<ShortcutAction, { mac: string; other: string }>> = {
  search: { mac: '⌘ K', other: 'Ctrl K' },
  run: { mac: '⌘ Enter', other: 'Ctrl Enter' },
  suggest: { mac: '⌘ J', other: 'Ctrl J' },
  next: { mac: '⌘ ↓', other: 'Ctrl ↓' },
};

/**
 * The keyboard shortcuts of the app, with ⌘ on a Mac and Ctrl elsewhere. The view that was opened last answers them, so a view binds
 * what it offers and takes it along when it goes.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutCenter {
  // #region Fields

  private readonly _bindings: Array<ShortcutHandlers> = [];
  private _isMac: boolean = /mac/i.test(globalThis.navigator?.platform ?? '');
  private _isListening = false;

  // #endregion

  // #region Methods

  /**
   * Starts listening, once. It listens before the page does, because a control of Mosaik keeps some keys for itself.
   *
   * @param target What receives the keys.
   */
  public connect(target: Pick<Document, 'addEventListener'> = document): void {
    if (!this._isListening) {
      this._isListening = true;
      target.addEventListener(
        'keydown',
        (event) => {
          this.handle(event);
        },
        { capture: true },
      );
    }
  }

  /**
   * Says which modifier this platform uses.
   *
   * @param platform The platform, as Node.js names it.
   */
  public setPlatform(platform: string): void {
    this._isMac = platform === 'darwin';
  }

  /**
   * Binds what a view offers.
   *
   * @param handlers The actions.
   * @returns What takes them back.
   */
  public bind(handlers: ShortcutHandlers): () => void {
    this._bindings.push(handlers);

    return () => {
      const index = this._bindings.indexOf(handlers);

      if (index >= 0) {
        this._bindings.splice(index, 1);
      }
    };
  }

  /**
   * Answers a key.
   *
   * @param event The key.
   * @returns Whether it was a shortcut somebody answered.
   */
  public handle(event: KeyboardEvent): boolean {
    const action = this.actionOf(event);
    const handler = action ? this.handlerOf(action) : null;

    if (!handler) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    handler();

    return true;
  }

  /**
   * Returns how an action reads on this platform.
   *
   * @param action The action.
   * @returns The keys.
   */
  public labelOf(action: ShortcutAction): string {
    return this._isMac ? LABELS[action].mac : LABELS[action].other;
  }

  /**
   * @private
   */
  private actionOf(event: KeyboardEvent): ShortcutAction | null {
    const hasModifier = this._isMac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;

    return hasModifier && !event.altKey && !event.shiftKey
      ? (KEYS[event.key.toLowerCase()] ?? null)
      : null;
  }

  /**
   * @private
   */
  private handlerOf(action: ShortcutAction): (() => unknown) | null {
    for (const binding of [...this._bindings].reverse()) {
      const handler = binding[action];

      if (handler) {
        return handler;
      }
    }

    return null;
  }

  // #endregion
}

/**
 * Binds what a view offers for as long as it lives. It runs in the constructor of its presenter.
 *
 * @public
 * @param handlers The actions.
 */
export function bindShortcuts(handlers: ShortcutHandlers): void {
  inject(DestroyRef).onDestroy(inject(ShortcutCenter).bind(handlers));
}
