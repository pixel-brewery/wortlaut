// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ProgressBarComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-bar';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TooltipComponent } from '@pixel-brewery/mosaik-elements-angular/components/tooltip';
import { FailureStateComponent, LoadingStateComponent, PaneSizeDirective } from '@pixel-brewery/wortlaut-frontend-ui';
import { OverviewViewPresenter } from '../view-presenters/OverviewViewPresenter';

// #endregion

/**
 * The state of the open project. Its links lead elsewhere; nothing here starts any work.
 */
@Component({
    selector: 'wortlaut-overview',
    host: { class: 'page-frame' },
    imports: [
        AnchorComponent,
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        EmptyStateComponent,
        FailureStateComponent,
        IconComponent,
        LoadingStateComponent,
        ProgressBarComponent,
        RouterLink,
        SplitComponent,
        PaneSizeDirective,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        TooltipComponent
    ],
    providers: [OverviewViewPresenter],
    templateUrl: './OverviewView.html',
    styleUrl: './OverviewView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(OverviewViewPresenter);

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
