// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { ListComponent, ListItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/list';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { TabStripComponent, TabStripItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/tab-strip';
import { FailureStateComponent, LoadingStateComponent, RunProgressComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { RunsViewPresenter } from '../view-presenters/RunsViewPresenter';

// #endregion

/**
 * Every run of the open project, with its log, its changes and its configuration.
 */
@Component({
    selector: 'wortlaut-runs',
    imports: [BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, FailureStateComponent, ListComponent, ListItemComponent, LoadingStateComponent, MessageComponent, RunProgressComponent, TabStripComponent, TabStripItemComponent],
    providers: [RunsViewPresenter],
    templateUrl: './RunsView.html',
    styleUrl: './RunsView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RunsView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(RunsViewPresenter);

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
