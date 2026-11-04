// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { PaneSizeDirective } from '@pixel-brewery/wortlaut-frontend-ui';
import { SidebarComponent } from '../components/SidebarComponent';
import { TitlebarComponent } from '../components/TitlebarComponent';
import { AppShellViewPresenter } from '../view-presenters/AppShellViewPresenter';
import { SearchPalettePresenter } from '../view-presenters/SearchPalettePresenter';

// #endregion

/**
 * The frame of every view after the start screens: title bar, sidebar and the view.
 */
@Component({
    selector: 'wortlaut-app-shell',
    imports: [RouterOutlet, SidebarComponent, TitlebarComponent, SplitComponent, PaneSizeDirective],
    providers: [AppShellViewPresenter, SearchPalettePresenter],
    templateUrl: './AppShellView.html',
    styleUrl: './AppShellView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShellView implements OnInit {

    // #region Fields

    private readonly _presenter = inject(AppShellViewPresenter);

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this._presenter.load();
    }

    // #endregion

}
