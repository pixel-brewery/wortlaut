// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  CardComponent,
  CardHeaderComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import {
  TabStripComponent,
  TabStripItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/tab-strip';
import {
  TableBodyCellComponent,
  TableBodyComponent,
  TableBodyRowComponent,
  TableComponent,
  TableHeaderCellComponent,
  TableHeaderComponent,
  TableHeaderRowComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/table';
import { FailureStateComponent, LoadingStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { CliNxViewPresenter } from '../view-presenters/CliNxViewPresenter';

// #endregion

/**
 * The files stay the source, and the CLI and Nx keep working without the app. This view shows what they read.
 */
@Component({
  selector: 'wortlaut-cli-nx',
  host: { class: 'page-frame' },
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    EmptyStateComponent,
    FailureStateComponent,
    FormFieldDirective,
    LoadingStateComponent,
    MessageComponent,
    SearchBoxComponent,
    TabStripComponent,
    TabStripItemComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TableHeaderCellComponent,
    TableHeaderComponent,
    TableHeaderRowComponent,
  ],
  providers: [CliNxViewPresenter],
  templateUrl: './CliNxView.html',
  styleUrl: './CliNxView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CliNxView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(CliNxViewPresenter);

  // #endregion

  // #region Methods

  /**
   * @public
   * @override
   */
  public ngOnInit(): void {
    void this.presenter.load();
  }

  // #endregion
}
