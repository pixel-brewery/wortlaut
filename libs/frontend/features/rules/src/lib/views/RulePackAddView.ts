// #region Imports

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  DialogActionsComponent,
  DialogComponent,
  DialogContentComponent,
  DialogHeaderComponent,
  DialogHeaderSubTextComponent,
  DialogHeaderTextComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import {
  SegmentComponent,
  SegmentItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/segment';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import {
  TableBodyCellComponent,
  TableBodyComponent,
  TableBodyRowComponent,
  TableComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DryRunNoticeComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { RulePackAddViewPresenter } from '../view-presenters/RulePackAddViewPresenter';

// #endregion

/**
 * Checks a pack from GitHub, npm or a folder without running anything, shows what it may do, and pins it.
 */
@Component({
  selector: 'wortlaut-rule-pack-add',
  imports: [
    ButtonComponent,
    DialogActionsComponent,
    DialogComponent,
    DialogContentComponent,
    DialogHeaderComponent,
    DialogHeaderSubTextComponent,
    DialogHeaderTextComponent,
    DryRunNoticeComponent,
    FormFieldDirective,
    IconComponent,
    MessageComponent,
    SegmentComponent,
    SegmentItemComponent,
    SelectComponent,
    SelectItemComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TextBoxComponent,
  ],
  providers: [RulePackAddViewPresenter],
  templateUrl: './RulePackAddView.html',
  styleUrl: './RulePackAddView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulePackAddView {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(RulePackAddViewPresenter);

  // #endregion
}
