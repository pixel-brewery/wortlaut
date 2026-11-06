// #region Imports

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  TabStripComponent,
  TabStripItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/tab-strip';
import { TestLabLayoutViewPresenter } from '../view-presenters/TestLabLayoutViewPresenter';

// #endregion

/**
 * The frame of the test lab.
 */
@Component({
  selector: 'wortlaut-test-lab',
  host: { class: 'page-frame' },
  imports: [RouterOutlet, TabStripComponent, TabStripItemComponent],
  providers: [TestLabLayoutViewPresenter],
  templateUrl: './TestLabLayoutView.html',
  styleUrl: './TestLabLayoutView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestLabLayoutView {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(TestLabLayoutViewPresenter);

  // #endregion
}
