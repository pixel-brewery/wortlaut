// #region Imports

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { ToggleSwitchComponent } from '@pixel-brewery/mosaik-elements-angular/components/toggle-switch';
import { WorkspaceTileComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { AppShellViewPresenter } from '../view-presenters/AppShellViewPresenter';
import { SearchPalettePresenter } from '../view-presenters/SearchPalettePresenter';
import { SearchPaletteComponent } from './SearchPaletteComponent';

// #endregion

/**
 * The title bar: where the user is, the search, the active AI provider and the dry run switch.
 */
@Component({
    selector: 'wortlaut-titlebar',
    imports: [ButtonComponent, IconComponent, RouterLink, SearchBoxComponent, SearchPaletteComponent, ToggleSwitchComponent, WorkspaceTileComponent],
    templateUrl: './TitlebarComponent.html',
    styleUrl: './TitlebarComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitlebarComponent {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(AppShellViewPresenter);

    /**
     * Gets the search.
     *
     * @readonly
     */
    protected readonly palette = inject(SearchPalettePresenter);

    // #endregion

}
