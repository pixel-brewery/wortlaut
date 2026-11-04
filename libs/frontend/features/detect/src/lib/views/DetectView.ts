// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { DryRunNoticeComponent, FailureStateComponent, LoadingStateComponent, PaneSizeDirective, RunProgressComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { DetectViewPresenter } from '../view-presenters/DetectViewPresenter';

// #endregion

/**
 * Finds the strings of the sources that still need a key, and replaces them in the source and the catalog.
 */
@Component({
    selector: 'wortlaut-detect',
    host: { class: 'page-frame' },
    imports: [
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        DryRunNoticeComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        MessageComponent,
        PaneSizeDirective,
        RunProgressComponent,
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
        ToggleSwitchComponent,
        WriteResultComponent
    ],
    providers: [DetectViewPresenter],
    templateUrl: './DetectView.html',
    styleUrl: './DetectView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DetectView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(DetectViewPresenter);

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
     * @param event The input event.
     */
    protected onKeyInput(event: Event): void {
        this.presenter.nameKey((event.target as HTMLInputElement).value);
    }

    // #endregion

}
