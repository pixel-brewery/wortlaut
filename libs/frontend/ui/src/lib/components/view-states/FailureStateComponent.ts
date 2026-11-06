// #region Imports

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { ErrorStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/error-state';

// #endregion

/**
 * The state of a view whose data could not be loaded, with the true reason and a way to try again. Its texts go through
 * the slots, because the element does not render header and content properties that change after its first render.
 */
@Component({
  selector: 'wortlaut-failure-state',
  imports: [ButtonComponent, ErrorStateComponent],
  template: `
    <div class="state-frame">
      <mosaik-error-state>
        <span slot="header" class="state-title">{{ header() }}</span>
        <span class="muted">{{ message() }}</span>
        <mosaik-button
          slot="actions"
          label="Try again"
          variant="neutral"
          appearance="outline"
          (click)="retry.emit()"
        />
      </mosaik-error-state>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FailureStateComponent {
  // #region Properties

  /**
   * Says what failed.
   *
   * @readonly
   */
  public readonly header = input('This could not be loaded');

  /**
   * Gives the reason.
   *
   * @readonly
   */
  public readonly message = input<string | null>(null);

  /**
   * Asks to load it again.
   *
   * @readonly
   */
  public readonly retry = output();

  // #endregion
}
