// #region Imports

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';

// #endregion

/**
 * What a sidebar entry shows while its feature is not built yet.
 */
@Component({
  selector: 'wortlaut-not-available',
  imports: [EmptyStateComponent],
  templateUrl: './NotAvailableView.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotAvailableView {
  // #region Fields

  private readonly _data = inject(ActivatedRoute).snapshot.data as {
    title: string;
    description: string;
  };

  // #endregion

  // #region Properties

  /**
   * Gets the name of the view.
   *
   * @readonly
   */
  protected readonly title = this._data.title;

  /**
   * Gets what the view will do, and what works today.
   *
   * @readonly
   */
  protected readonly description = this._data.description;

  // #endregion
}
