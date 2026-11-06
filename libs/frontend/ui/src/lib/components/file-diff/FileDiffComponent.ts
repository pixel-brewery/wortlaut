// #region Imports

import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PaginatorComponent } from '@pixel-brewery/mosaik-elements-angular/components/paginator';
import type { ReviewFile } from '@pixel-brewery/wortlaut-contracts';
import { DIFF_PAGE_SIZE, diffPage } from './DiffPage';

// #endregion

/**
 * The diff of a file of a change, on Review and on Review update alike.
 */
@Component({
  selector: 'wortlaut-file-diff',
  imports: [PaginatorComponent],
  templateUrl: './FileDiffComponent.html',
  styleUrl: './FileDiffComponent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDiffComponent {
  // #region Fields

  private readonly _page = signal(0);
  private readonly _pageStart = viewChild<ElementRef<HTMLElement>>('pageStart');
  private _scrollRequested = false;

  // #endregion

  // #region Ctor

  public constructor() {
    effect(() => {
      this.file();
      untracked(() => this._page.set(0));
    });

    afterRenderEffect(() => {
      this.current();

      if (this._scrollRequested) {
        this._pageStart()?.nativeElement.scrollIntoView({ block: 'nearest' });
        this._scrollRequested = false;
      }
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the file with its diff.
   *
   * @readonly
   */
  public readonly file = input.required<ReviewFile>();

  protected readonly pageSize = DIFF_PAGE_SIZE;
  protected readonly current = computed(() => diffPage(this.file(), this._page()));

  // #endregion

  // #region Methods

  protected showPage(page: number): void {
    this._scrollRequested = page !== this.current().page;
    this._page.set(page);
  }

  // #endregion
}
