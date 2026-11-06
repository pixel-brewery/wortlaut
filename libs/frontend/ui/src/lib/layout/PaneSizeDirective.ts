// #region Imports

import { afterRenderEffect, Directive, ElementRef, inject, input } from '@angular/core';
import type { SplitElement } from '@pixel-brewery/mosaik-elements-foundation';
import { PaneSizeMemory } from './PaneSizeMemory';

// #endregion

/**
 * Restores a split's user-adjusted size after Mosaik has measured its panels.
 * Mosaik continues to own dragging, keyboard interaction and minimum/maximum constraints.
 */
@Directive({
  selector: 'mosaik-split[paneSizeKey]',
  host: { '(splitReposition)': 'persist()' },
})
export class PaneSizeDirective {
  // #region Fields

  private readonly _element = inject<ElementRef<SplitElement>>(ElementRef).nativeElement;
  private readonly _memory = new PaneSizeMemory(this.storage());
  private _applied = false;

  // #endregion

  // #region Ctor

  public constructor() {
    afterRenderEffect((onCleanup) => {
      const unit = this._element.lock === 'none' ? '%' : 'px';
      const remembered = this._memory.read(this.paneSizeKey(), unit);
      const position =
        remembered === undefined ? this.paneSize() : (`${remembered}${unit}` as const);
      let cancelled = false;

      this._applied = false;
      onCleanup(() => {
        cancelled = true;
      });

      void this._element.updateComplete.then(async () => {
        if (!cancelled) {
          this._element.position = position;
          await this._element.updateComplete;
          this._applied = !cancelled;
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /** Stable name for this pane's preference, independent of the current project or record. */
  public readonly paneSizeKey = input.required<string>();

  /** Initial size until the user adjusts the pane. */
  public readonly paneSize = input.required<SplitElement['position']>();

  // #endregion

  // #region Methods

  protected persist(): void {
    if (this._applied) {
      const unit = this._element.lock === 'none' ? '%' : 'px';
      const size = unit === '%' ? this._element.positionPercentage : this._element.positionInPixels;
      this._memory.remember(this.paneSizeKey(), size, unit);
    }
  }

  private storage(): Storage | undefined {
    try {
      return this._element.ownerDocument.defaultView?.localStorage;
    } catch {
      return undefined;
    }
  }

  // #endregion
}
