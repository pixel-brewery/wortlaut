// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { DropZoneComponent } from '@pixel-brewery/mosaik-elements-angular/components/drop-zone';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ListComponent, ListItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/list';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { LogoComponent, WorkspaceTileComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { WelcomeViewPresenter } from '../view-presenters/WelcomeViewPresenter';

// #endregion

/**
 * The start screen when no project is open.
 */
@Component({
    selector: 'wortlaut-welcome',
    imports: [AnchorComponent, ButtonComponent, CardComponent, CardHeaderComponent, DropZoneComponent, IconComponent, ListComponent, ListItemComponent, LogoComponent, MessageComponent, WorkspaceTileComponent],
    providers: [WelcomeViewPresenter],
    templateUrl: './WelcomeView.html',
    styleUrl: './WelcomeView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WelcomeView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(WelcomeViewPresenter);

    /**
     * Gets what the product does, as static copy.
     *
     * @readonly
     */
    protected readonly features = [
        { title: 'Detect', text: 'Finds hard-coded strings in Angular, Lit, React, Vue and Stencil code.', icon: 'search' },
        { title: 'Analyze', text: 'Reports missing, duplicate, empty and unused translations.', icon: 'clipboardTask' },
        { title: 'Generate', text: 'Translates with AI, and you review the result before it is written.', icon: 'sparkle' },
        { title: 'Transform', text: 'Sorts catalogs and converts them to JSON, RESX, TypeScript and PO.', icon: 'sync' }
    ];

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this.presenter.recent.reload();
    }

    // #endregion

}
