// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { ProgressBarComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-bar';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { FailureStateComponent, LoadingStateComponent, LocaleFlagPipe, LocaleLabelComponent, PaneSizeDirective, TextWindowComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { GenerateRunViewPresenter } from '../view-presenters/GenerateRunViewPresenter';

// #endregion

/**
 * Generate: run and review. It follows a run that lives in main and reviews what it translated.
 */
@Component({
    selector: 'wortlaut-generate-run',
    host: { class: 'page-frame' },
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        CheckboxComponent,
        FailureStateComponent,
        IconComponent,
        LoadingStateComponent,
        LocaleFlagPipe,
        LocaleLabelComponent,
        MessageComponent,
        PaneSizeDirective,
        ProgressBarComponent,
        SegmentComponent,
        SegmentItemComponent,
        SplitComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        TextBoxComponent,
        TextWindowComponent,
        WriteResultComponent
    ],
    providers: [GenerateRunViewPresenter],
    templateUrl: './GenerateRunView.html',
    styleUrl: './GenerateRunView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerateRunView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(GenerateRunViewPresenter);

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
     * Passes on what the user typed.
     *
     * @param key The key.
     * @param event The input event.
     */
    protected onEdit(key: string, event: Event): void {
        this.presenter.edit(key, (event.target as HTMLInputElement).value);
    }

    // #endregion

}
