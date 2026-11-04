// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { DryRunNoticeComponent, FailureStateComponent, LoadingStateComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { SettingsProjectViewPresenter } from '../view-presenters/SettingsProjectViewPresenter';

// #endregion

/**
 * The settings of the open project. Saving builds a change set against the file each value comes from.
 */
@Component({
    selector: 'wortlaut-settings-project',
    host: { class: 'page-frame' },
    imports: [ButtonComponent, CardComponent, CardHeaderComponent, CheckboxComponent, ChipComponent, DryRunNoticeComponent, EmptyStateComponent, FailureStateComponent, FormFieldDirective, LoadingStateComponent, MessageComponent, SelectComponent, SelectItemComponent, TextBoxComponent, WriteResultComponent],
    providers: [SettingsProjectViewPresenter],
    templateUrl: './SettingsProjectView.html',
    styleUrl: './SettingsProjectView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsProjectView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SettingsProjectViewPresenter);

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
