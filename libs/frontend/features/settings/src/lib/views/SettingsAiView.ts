// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { PasswordBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/password-box';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { DryRunNoticeComponent, FailureStateComponent, LoadingStateComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { SettingsAiViewPresenter } from '../view-presenters/SettingsAiViewPresenter';

// #endregion

/**
 * Settings: AI. The assistants and API keys of this computer, and the starting values of a run.
 */
@Component({
    selector: 'wortlaut-settings-ai',
    host: { class: 'page-frame' },
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        DryRunNoticeComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        MessageComponent,
        PasswordBoxComponent,
        SelectComponent,
        SelectItemComponent,
        TextBoxComponent,
        ToggleSwitchComponent,
        WriteResultComponent
    ],
    providers: [SettingsAiViewPresenter],
    templateUrl: './SettingsAiView.html',
    styleUrl: './SettingsAiView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsAiView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SettingsAiViewPresenter);

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
     * @param providerId The provider.
     * @param event The value of the password box.
     */
    protected onKey(providerId: string, event: unknown): void {
        // The password box hands over its value as the event.
        this.presenter.typeKey(providerId, String(event));
    }

    /**
     * Passes on the instructions of a locale.
     *
     * @param code The locale.
     * @param event The input event.
     */
    protected onLocaleInstructions(code: string, event: Event): void {
        this.presenter.setLocaleInstructions(code, (event.target as HTMLInputElement).value);
    }

    // #endregion

}
