// #region Imports

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { MenuItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/menu';
import { AppShellViewPresenter } from '../view-presenters/AppShellViewPresenter';

// #endregion

/**
 * The sidebar. The active item follows the route, and the footer shows the real version.
 */
@Component({
  selector: 'wortlaut-sidebar',
  imports: [BadgeComponent, MenuItemComponent, RouterLink],
  templateUrl: './SidebarComponent.html',
  styleUrl: './SidebarComponent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  // #region Properties

  /**
   * Gets the presenter.
   *
   * @readonly
   */
  protected readonly presenter = inject(AppShellViewPresenter);

  // #endregion
}
