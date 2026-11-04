// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { DryRunNoticeComponent, FailureStateComponent, LoadingStateComponent, PaneSizeDirective, RunProgressComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { TransformViewPresenter } from '../view-presenters/TransformViewPresenter';

// #endregion

/**
 * Converts catalogs into other formats and keeps their keys in order.
 */
@Component({
    selector: 'wortlaut-transform',
    host: { class: 'page-frame' },
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        CheckboxComponent,
        DryRunNoticeComponent,
        EmptyStateComponent,
        FailureStateComponent,
        LoadingStateComponent,
        MessageComponent,
        PaneSizeDirective,
        RunProgressComponent,
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
        WriteResultComponent
    ],
    providers: [TransformViewPresenter],
    templateUrl: './TransformView.html',
    styleUrl: './TransformView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransformView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(TransformViewPresenter);

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
     * Stops what is going on.
     *
     * @returns When main knows.
     */
    protected async cancel(): Promise<void> {
        await this.presenter.transformRun.cancel();
        await this.presenter.sortRun.cancel();
    }

    // #endregion

}
