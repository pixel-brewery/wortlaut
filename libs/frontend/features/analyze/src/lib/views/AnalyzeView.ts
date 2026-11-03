// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ClickableComponent } from '@pixel-brewery/mosaik-elements-angular/components/clickable';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { DryRunNoticeComponent, FailureStateComponent, LoadingStateComponent, RunProgressComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { AnalyzeViewPresenter } from '../view-presenters/AnalyzeViewPresenter';

// #endregion

/**
 * Runs the rules on the catalogs, shows what they found, and writes exceptions into the project's configuration.
 */
@Component({
    selector: 'wortlaut-analyze',
    imports: [
        AnchorComponent,
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        ClickableComponent,
        DryRunNoticeComponent,
        EmptyStateComponent,
        FailureStateComponent,
        LoadingStateComponent,
        MessageComponent,
        RouterLink,
        RunProgressComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        ToggleSwitchComponent,
        WriteResultComponent
    ],
    providers: [AnalyzeViewPresenter],
    templateUrl: './AnalyzeView.html',
    styleUrl: './AnalyzeView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyzeView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(AnalyzeViewPresenter);

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
