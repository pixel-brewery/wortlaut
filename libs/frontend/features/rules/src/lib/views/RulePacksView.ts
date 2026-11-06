// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  CardComponent,
  CardHeaderComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ClickableComponent } from '@pixel-brewery/mosaik-elements-angular/components/clickable';
import {
  DialogActionsComponent,
  DialogComponent,
  DialogContentComponent,
  DialogHeaderComponent,
  DialogHeaderSubTextComponent,
  DialogHeaderTextComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import {
  TableBodyCellComponent,
  TableBodyComponent,
  TableBodyRowComponent,
  TableComponent,
  TableHeaderCellComponent,
  TableHeaderComponent,
  TableHeaderRowComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/table';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import type { RuleSeverity } from '@pixel-brewery/wortlaut-contracts';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import {
  DryRunNoticeComponent,
  FailureStateComponent,
  FileDiffComponent,
  LoadingStateComponent,
  PaneSizeDirective,
  WriteResultComponent,
} from '@pixel-brewery/wortlaut-frontend-ui';
import { RulePacksViewPresenter } from '../view-presenters/RulePacksViewPresenter';

// #endregion

/**
 * The rule packs of a workspace: their rules with what those are worth, where they come from and what they may do, and an update
 * as a change someone reviews.
 */
@Component({
  selector: 'wortlaut-rule-packs',
  host: { class: 'page-frame' },
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    ClickableComponent,
    DialogActionsComponent,
    DialogComponent,
    DialogContentComponent,
    DialogHeaderComponent,
    DialogHeaderSubTextComponent,
    DialogHeaderTextComponent,
    DryRunNoticeComponent,
    FailureStateComponent,
    FileDiffComponent,
    LoadingStateComponent,
    PaneSizeDirective,
    MessageComponent,
    SplitComponent,
    RouterLink,
    RouterOutlet,
    SelectComponent,
    SelectItemComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TableHeaderCellComponent,
    TableHeaderComponent,
    TableHeaderRowComponent,
    ToggleSwitchComponent,
    WriteResultComponent,
  ],
  providers: [RulePacksViewPresenter],
  templateUrl: './RulePacksView.html',
  styleUrl: './RulePacksView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulePacksView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(RulePacksViewPresenter);

  // #endregion

  // #region Methods

  /**
   * @public
   * @override
   */
  public ngOnInit(): void {
    void this.presenter.load();
  }

  /**
   * Reads the severity a select chose.
   *
   * @protected
   * @param ruleId The rule.
   * @param item The item it chose.
   */
  protected onSeverity(ruleId: string, item: unknown): void {
    const value = (item as { value?: unknown } | null)?.value;

    if (value === 'error' || value === 'warning' || value === 'off') {
      void this.presenter.setSeverity(ruleId, value satisfies RuleSeverity);
    }
  }

  // #endregion
}
