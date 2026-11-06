// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
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
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
import {
  TableBodyCellComponent,
  TableBodyComponent,
  TableBodyRowComponent,
  TableComponent,
  TableHeaderCellComponent,
  TableHeaderComponent,
  TableHeaderRowComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/table';
import { ProgressBarComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-bar';
import {
  DryRunNoticeComponent,
  FailureStateComponent,
  LoadingStateComponent,
  LocaleLabelComponent,
} from '@pixel-brewery/wortlaut-frontend-ui';
import { ProjectsViewPresenter } from '../view-presenters/ProjectsViewPresenter';

// #endregion

/**
 * The projects of the open workspace.
 */
@Component({
  selector: 'wortlaut-projects',
  host: { class: 'page-frame' },
  imports: [
    AnchorComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    EmptyStateComponent,
    FailureStateComponent,
    DryRunNoticeComponent,
    FormFieldDirective,
    ProgressBarComponent,
    LoadingStateComponent,
    LocaleLabelComponent,
    MessageComponent,
    SearchBoxComponent,
    SegmentComponent,
    SegmentItemComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TableHeaderCellComponent,
    TableHeaderComponent,
    TableHeaderRowComponent,
  ],
  providers: [ProjectsViewPresenter],
  templateUrl: './ProjectsView.html',
  styleUrl: './ProjectsView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(ProjectsViewPresenter);

  // #endregion

  // #region Methods

  /**
   * @public
   * @override
   */
  public ngOnInit(): void {
    void this.presenter.list.reload();
    void this.presenter.loadBatch();
  }

  // #endregion
}
