// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ColorSwatchComponent } from '@pixel-brewery/mosaik-elements-angular/components/color-swatch';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { FailureStateComponent, LoadingStateComponent, PaneSizeDirective, WorkspaceTileComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { WorkspacesViewPresenter } from '../view-presenters/WorkspacesViewPresenter';

// #endregion

/**
 * Every workspace of this computer as a card, and the form for a new one.
 */
@Component({
    selector: 'wortlaut-workspaces',
    host: { class: 'page-frame' },
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        ColorSwatchComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        PaneSizeDirective,
        MessageComponent,
        SplitComponent,
        SegmentComponent,
        SegmentItemComponent,
        TextBoxComponent,
        WorkspaceTileComponent
    ],
    providers: [WorkspacesViewPresenter],
    templateUrl: './WorkspacesView.html',
    styleUrl: './WorkspacesView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspacesView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(WorkspacesViewPresenter);

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this.presenter.workspaces.reload();
    }

    // #endregion

}
