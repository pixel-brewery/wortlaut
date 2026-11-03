// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { FailureStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { TestPatternsViewPresenter } from '../view-presenters/TestPatternsViewPresenter';

// #endregion

/**
 * Shows which keys of the project a pattern covers.
 */
@Component({
    selector: 'wortlaut-test-patterns',
    imports: [
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        IconComponent,
        MessageComponent,
        SegmentComponent,
        SegmentItemComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TextBoxComponent
    ],
    providers: [TestPatternsViewPresenter],
    templateUrl: './TestPatternsView.html',
    styleUrl: './TestPatternsView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestPatternsView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(TestPatternsViewPresenter);

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this.presenter.result.reload();
    }

    // #endregion

}
