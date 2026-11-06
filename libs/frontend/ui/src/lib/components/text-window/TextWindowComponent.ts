// #region Imports

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { PaginatorComponent } from '@pixel-brewery/mosaik-elements-angular/components/paginator';
import { TEXT_PAGE_SIZE, textPage } from './TextPage';

// #endregion

/** A bounded, pageable text viewport shared by logs and configuration previews. */
@Component({
  selector: 'wortlaut-text-window',
  imports: [PaginatorComponent],
  templateUrl: './TextWindowComponent.html',
  styleUrl: './TextWindowComponent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextWindowComponent {
  // #region Fields

  private readonly _page = signal(0);

  // #endregion

  // #region Ctor

  public constructor() {
    effect(() => {
      this.pageKey();
      untracked(() => this._page.set(0));
    });
  }

  // #endregion

  // #region Properties

  /** Complete source; only the current text page reaches the DOM. */
  public readonly text = input.required<string>();

  /** Resets paging on record/tab changes while preserving it as a live log grows. */
  public readonly pageKey = input.required<string>();

  protected readonly pageSize = TEXT_PAGE_SIZE;
  protected readonly current = computed(() => textPage(this.text(), this._page()));

  // #endregion

  // #region Methods

  protected showPage(page: number): void {
    this._page.set(page);
  }

  // #endregion
}
