// #region Imports

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/menu';

// #endregion

/**
 * The frame of the settings: their sections and the open one.
 */
@Component({
    selector: 'wortlaut-settings-layout',
    imports: [MenuItemComponent, RouterLink, RouterLinkActive, RouterOutlet],
    templateUrl: './SettingsLayoutView.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsLayoutView {

    // #region Properties

    /**
     * Gets the sections.
     *
     * @readonly
     */
    protected readonly sections = [
        { label: 'Workspace', icon: 'folder', route: '/settings/workspace' },
        { label: 'Project', icon: 'folderOpen', route: '/settings/project' },
        { label: 'AI', icon: 'sparkle', route: '/settings/ai' },
        { label: 'Application', icon: 'settings', route: '/settings/application' }
    ];

    // #endregion

}
