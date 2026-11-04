// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import { ChoiceComponent, ChoiceGroupComponent } from '@pixel-brewery/mosaik-elements-angular/components/choice';
import { DialogActionsComponent, DialogComponent, DialogContentComponent, DialogHeaderComponent, DialogHeaderTextComponent } from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { ExpanderComponent } from '@pixel-brewery/mosaik-elements-angular/components/expander';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { SliderComponent } from '@pixel-brewery/mosaik-elements-angular/components/slider';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import type { AiProvider } from '@pixel-brewery/wortlaut-contracts';
import { FailureStateComponent, LoadingStateComponent, LocaleFlagPipe, LocaleLabelComponent, PaneSizeDirective } from '@pixel-brewery/wortlaut-frontend-ui';
import { GenerateSetupViewPresenter } from '../view-presenters/GenerateSetupViewPresenter';

// #endregion

/**
 * Generate: set up. It chooses locales, keys, provider and instructions, and says what the run would take.
 */
@Component({
    selector: 'wortlaut-generate-setup',
    host: { class: 'page-frame' },
    imports: [
        AnchorComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        ChipComponent,
        ChoiceComponent,
        ChoiceGroupComponent,
        DialogActionsComponent,
        DialogComponent,
        DialogContentComponent,
        DialogHeaderComponent,
        DialogHeaderTextComponent,
        EmptyStateComponent,
        ExpanderComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        LocaleFlagPipe,
        LocaleLabelComponent,
        MessageComponent,
        PaneSizeDirective,
        SegmentComponent,
        SegmentItemComponent,
        SelectComponent,
        SelectItemComponent,
        SliderComponent,
        SplitComponent,
        TextBoxComponent,
        ToggleSwitchComponent
    ],
    providers: [GenerateSetupViewPresenter],
    templateUrl: './GenerateSetupView.html',
    styleUrl: './GenerateSetupView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerateSetupView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(GenerateSetupViewPresenter);

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
     * Passes on the provider a choice stands for.
     *
     * @param id The provider.
     */
    protected pick(id: AiProvider['id']): void {
        this.presenter.pickProvider(id);
    }

    /**
     * Passes on the value of the slider.
     *
     * @param event What the slider says changed.
     */
    protected onTemperature(event: { newValue?: number }): void {
        if (typeof event.newValue === 'number') {
            this.presenter.setTemperature(event.newValue);
        }
    }

    // #endregion

}
