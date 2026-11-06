// #region Imports

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { localeName } from '@pixel-brewery/wortlaut-frontend-core';
import { localeFlagIcon } from '../../locales/localeFlagIcon';

// #endregion

/**
 * Identifies a content locale with its name and a decorative Mosaik flag.
 * The locale code and accessible text remain authoritative when no flag exists.
 */
@Component({
  selector: 'wortlaut-locale-label',
  imports: [IconComponent],
  templateUrl: './LocaleLabelComponent.html',
  styleUrl: './LocaleLabelComponent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocaleLabelComponent {
  // #region Properties

  /**
   * The existing locale identifier, including any region or script.
   *
   * @readonly
   */
  public readonly code = input.required<string>();

  /**
   * An existing display label; otherwise the English locale name is used.
   *
   * @readonly
   */
  public readonly label = input<string>();

  /**
   * Whether to display the unchanged locale code alongside its name.
   *
   * @readonly
   */
  public readonly showCode = input(false);

  /**
   * Gets the registered flag alias when the locale has a supported region.
   *
   * @readonly
   */
  protected readonly icon = computed(() => localeFlagIcon(this.code()));

  /**
   * Gets the textual label independently of the decorative flag.
   *
   * @readonly
   */
  protected readonly name = computed(() => this.label() ?? localeName(this.code()));

  // #endregion
}
