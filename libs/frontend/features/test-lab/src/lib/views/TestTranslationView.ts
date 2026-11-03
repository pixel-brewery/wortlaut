// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { FailureStateComponent, LoadingStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { TestTranslationViewPresenter } from '../view-presenters/TestTranslationViewPresenter';

// #endregion

/**
 * Test lab: translation. It compares two setups on a sample and writes nothing.
 */
@Component({
    selector: 'wortlaut-test-translation',
    imports: [
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        MessageComponent,
        SelectComponent,
        SelectItemComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        TextBoxComponent
    ],
    providers: [TestTranslationViewPresenter],
    templateUrl: './TestTranslationView.html',
    styleUrl: './TestTranslationView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestTranslationView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(TestTranslationViewPresenter);

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
     * Passes on a model.
     *
     * @param index The setup.
     * @param event The input event.
     */
    protected onModel(index: number, event: Event): void {
        this.presenter.setSetup(index, { model: (event.target as HTMLInputElement).value });
    }

    /**
     * Passes on a temperature.
     *
     * @param index The setup.
     * @param event The input event.
     */
    protected onTemperature(index: number, event: Event): void {
        const value = Number((event.target as HTMLInputElement).value);

        if (value >= 0 && value <= 1) {
            this.presenter.setSetup(index, { temperature: value });
        }
    }

    // #endregion

}
