// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import {
  DialogActionsComponent,
  DialogComponent,
  DialogContentComponent,
  DialogHeaderComponent,
  DialogHeaderTextComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { PaginatorComponent } from '@pixel-brewery/mosaik-elements-angular/components/paginator';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import {
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import {
  TableBodyCellComponent,
  TableBodyComponent,
  TableBodyRowComponent,
  TableComponent,
  TableHeaderCellComponent,
  TableHeaderComponent,
  TableHeaderRowComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import {
  CodexFileAccessNoticeComponent,
  DryRunNoticeComponent,
  FailureStateComponent,
  LoadingStateComponent,
  LocaleFlagPipe,
  LocaleLabelComponent,
  PaneSizeDirective,
  WriteResultComponent,
} from '@pixel-brewery/wortlaut-frontend-ui';
import { TranslationsViewPresenter } from '../view-presenters/TranslationsViewPresenter';

// #endregion

/**
 * The keys of a project: browse them by namespace, search and filter them, and edit a value.
 */
@Component({
  selector: 'wortlaut-translations',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CodexFileAccessNoticeComponent,
    DialogActionsComponent,
    DialogComponent,
    DialogContentComponent,
    DialogHeaderComponent,
    DialogHeaderTextComponent,
    DryRunNoticeComponent,
    EmptyStateComponent,
    FailureStateComponent,
    FormFieldDirective,
    IconComponent,
    LoadingStateComponent,
    LocaleFlagPipe,
    LocaleLabelComponent,
    MessageComponent,
    PaginatorComponent,
    PaneSizeDirective,
    RouterLink,
    SearchBoxComponent,
    SegmentComponent,
    SegmentItemComponent,
    SelectComponent,
    SelectItemComponent,
    SplitComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TableHeaderCellComponent,
    TableHeaderComponent,
    TableHeaderRowComponent,
    TextBoxComponent,
    WriteResultComponent,
  ],
  providers: [TranslationsViewPresenter],
  templateUrl: './TranslationsView.html',
  styleUrl: './TranslationsView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationsView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(TranslationsViewPresenter);

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
