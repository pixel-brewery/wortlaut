// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  CardComponent,
  CardHeaderComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/card';
import { DotComponent } from '@pixel-brewery/mosaik-elements-angular/components/dot';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import {
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
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
import { McpViewPresenter } from '../view-presenters/McpViewPresenter';

// #endregion

/**
 * What assistants may do, how to connect one, its tools and what assistants did. The server itself starts when an assistant
 * connects.
 */
@Component({
  selector: 'wortlaut-mcp',
  host: { class: 'page-frame' },
  imports: [
    AnchorComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    DotComponent,
    EmptyStateComponent,
    FailureStateComponent,
    LoadingStateComponent,
    MessageComponent,
    SegmentComponent,
    SegmentItemComponent,
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
  providers: [McpViewPresenter],
  templateUrl: './McpView.html',
  styleUrl: './McpView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(McpViewPresenter);

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
