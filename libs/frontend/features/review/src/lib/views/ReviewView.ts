// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { ListComponent, ListItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/list';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { DryRunNoticeComponent, FailureStateComponent, FileDiffComponent, LoadingStateComponent, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { ReviewViewPresenter } from '../view-presenters/ReviewViewPresenter';

// #endregion

/**
 * The change sets that wait for a decision, each with its diff.
 */
@Component({
    selector: 'wortlaut-review',
    imports: [BadgeComponent, ButtonComponent, CardComponent, CardHeaderComponent, DryRunNoticeComponent, EmptyStateComponent, FailureStateComponent, FileDiffComponent, ListComponent, ListItemComponent, LoadingStateComponent, MessageComponent, WriteResultComponent],
    providers: [ReviewViewPresenter],
    templateUrl: './ReviewView.html',
    styleUrl: './ReviewView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReviewView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(ReviewViewPresenter);

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
