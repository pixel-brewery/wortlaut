// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { FailureStateComponent, LoadingStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { TestDetectorViewPresenter } from '../view-presenters/TestDetectorViewPresenter';

// #endregion

/**
 * Shows what the real detector finds in a sample or in pasted code.
 */
@Component({
    selector: 'wortlaut-test-detector',
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        MessageComponent,
        SegmentComponent,
        SegmentItemComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        TextBoxComponent
    ],
    providers: [TestDetectorViewPresenter],
    templateUrl: './TestDetectorView.html',
    styleUrl: './TestDetectorView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestDetectorView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(TestDetectorViewPresenter);

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
