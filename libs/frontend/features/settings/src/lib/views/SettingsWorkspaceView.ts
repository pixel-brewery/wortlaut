// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  CardComponent,
  CardHeaderComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import { ColorSwatchComponent } from '@pixel-brewery/mosaik-elements-angular/components/color-swatch';
import {
  DialogActionsComponent,
  DialogComponent,
  DialogContentComponent,
  DialogHeaderComponent,
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
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import {
  FailureStateComponent,
  LoadingStateComponent,
  LocaleFlagPipe,
  WorkspaceTileComponent,
} from '@pixel-brewery/wortlaut-frontend-ui';
import { SettingsWorkspaceViewPresenter } from '../view-presenters/SettingsWorkspaceViewPresenter';

// #endregion

/**
 * The settings of the open workspace. They live in the user's profile, so saving touches no repository.
 */
@Component({
  selector: 'wortlaut-settings-workspace',
  host: { class: 'page-frame' },
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    ChipComponent,
    ColorSwatchComponent,
    DialogActionsComponent,
    DialogComponent,
    DialogContentComponent,
    DialogHeaderComponent,
    DialogHeaderTextComponent,
    FailureStateComponent,
    FormFieldDirective,
    IconComponent,
    LoadingStateComponent,
    LocaleFlagPipe,
    MessageComponent,
    RouterLink,
    SegmentComponent,
    SegmentItemComponent,
    SelectComponent,
    SelectItemComponent,
    TextBoxComponent,
    ToggleSwitchComponent,
    WorkspaceTileComponent,
  ],
  providers: [SettingsWorkspaceViewPresenter],
  templateUrl: './SettingsWorkspaceView.html',
  styleUrl: './SettingsWorkspaceView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWorkspaceView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(SettingsWorkspaceViewPresenter);

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
