// #region Imports

import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, type OnInit, viewChild } from '@angular/core';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { ListComponent, ListItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/list';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { PaginatorComponent } from '@pixel-brewery/mosaik-elements-angular/components/paginator';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { DryRunNoticeComponent, FailureStateComponent, FileDiffComponent, LoadingStateComponent, PaneSizeDirective, WriteResultComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { ReviewViewPresenter } from '../view-presenters/ReviewViewPresenter';

// #endregion

/**
 * The change sets that wait for a decision, each with its diff.
 */
@Component({
    selector: 'wortlaut-review',
    host: { class: 'page-frame' },
    imports: [BadgeComponent, ButtonComponent, CardComponent, CardHeaderComponent, DryRunNoticeComponent, EmptyStateComponent, FailureStateComponent, FileDiffComponent, ListComponent, ListItemComponent, LoadingStateComponent, PaneSizeDirective, MessageComponent, PaginatorComponent, SplitComponent, WriteResultComponent],
    providers: [ReviewViewPresenter],
    templateUrl: './ReviewView.html',
    styleUrl: './ReviewView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReviewView implements OnInit {

    // #region Fields

    private readonly _fileScroller = viewChild<ElementRef<HTMLElement>>('fileScroller');

    // #endregion

    // #region Ctor

    /**
     * Opens each file page and change set at the beginning of its file list.
     *
     * @public
     */
    public constructor() {
        afterRenderEffect(() => {
            this.presenter.filePage();
            this.presenter.selectedId();

            const scroller = this._fileScroller()?.nativeElement;

            if (scroller) {
                scroller.scrollTop = 0;
            }
        });
    }

    // #endregion

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
