// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { KbdComponent } from '@pixel-brewery/mosaik-elements-angular/components/kbd';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { FailureStateComponent, LoadingStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { SettingsAppViewPresenter } from '../view-presenters/SettingsAppViewPresenter';

// #endregion

/**
 * The settings of the app on this computer. They apply immediately.
 */
@Component({
    selector: 'wortlaut-settings-app',
    imports: [ButtonComponent, CardComponent, CardHeaderComponent, FailureStateComponent, KbdComponent, LoadingStateComponent, MessageComponent, RouterLink, SegmentComponent, SegmentItemComponent, TextBoxComponent, ToggleSwitchComponent],
    providers: [SettingsAppViewPresenter],
    templateUrl: './SettingsAppView.html',
    styleUrl: './SettingsAppView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsAppView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SettingsAppViewPresenter);

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
