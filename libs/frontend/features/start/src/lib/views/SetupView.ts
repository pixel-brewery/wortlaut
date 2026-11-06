// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import {
  CardComponent,
  CardHeaderComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import {
  ChoiceComponent,
  ChoiceGroupComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/choice';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { FileBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/file-box';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { PasswordBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/password-box';
import {
  SelectComponent,
  SelectItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/select';
import {
  StepperComponent,
  StepperItemComponent,
} from '@pixel-brewery/mosaik-elements-angular/components/stepper';
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
import type { AiProviderId } from '@pixel-brewery/wortlaut-contracts';
import { formatName } from '@pixel-brewery/wortlaut-frontend-core';
import {
  FailureStateComponent,
  LoadingStateComponent,
  LocaleFlagPipe,
} from '@pixel-brewery/wortlaut-frontend-ui';
import { LocalePickerComponent } from '../components/locale-picker/LocalePickerComponent';
import { SetupViewPresenter } from '../view-presenters/SetupViewPresenter';

// #endregion

/**
 * Project setup: catalogs, locales and AI provider, outside the shell.
 */
@Component({
  selector: 'wortlaut-setup',
  host: { class: 'page-frame' },
  imports: [
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    ChipComponent,
    ChoiceComponent,
    ChoiceGroupComponent,
    EmptyStateComponent,
    FailureStateComponent,
    FileBoxComponent,
    FormFieldDirective,
    IconComponent,
    LocalePickerComponent,
    LocaleFlagPipe,
    LoadingStateComponent,
    MessageComponent,
    PasswordBoxComponent,
    SelectComponent,
    SelectItemComponent,
    StepperComponent,
    StepperItemComponent,
    TableBodyCellComponent,
    TableBodyComponent,
    TableBodyRowComponent,
    TableComponent,
    TableHeaderCellComponent,
    TableHeaderComponent,
    TableHeaderRowComponent,
    TextBoxComponent,
  ],
  providers: [SetupViewPresenter],
  templateUrl: './SetupView.html',
  styleUrl: './SetupView.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupView implements OnInit {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(SetupViewPresenter);

  /**
   * Writes the name of a catalog format.
   *
   * @readonly
   */
  protected readonly formatName = formatName;

  /**
   * Gets the registered Mosaik brand icons for the provider choices.
   *
   * @readonly
   */
  protected readonly providerIcons: Readonly<Record<AiProviderId, string>> = {
    'claude-code': 'aiClaude',
    codex: 'aiCodex',
    opencode: 'aiOpenCode',
    openai: 'aiOpenAI',
    google: 'aiGemini',
  };

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
   * Passes on what the user typed as a key.
   *
   * @param event The value of the password box.
   */
  protected onKey(event: unknown): void {
    // The password box hands over its value as the event.
    this.presenter.typeKey(String(event));
  }

  /**
   * Keeps the rail and the displayed step together, including keyboard navigation.
   *
   * @param event The step selected by Mosaik.
   */
  protected onStepChanged(event: { newIndex: number; cancel?: boolean }): void {
    if (event.newIndex === 0 || this.presenter.busy() || this.presenter.choosingSourceRoot()) {
      event.cancel = true;
      return;
    }

    this.presenter.goToStep(event.newIndex);
  }

  // #endregion
}
