// #region Imports

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * Says so while Dry run is on, on every screen that can write.
 */
@Component({
    selector: 'wortlaut-dry-run-notice',
    imports: [MessageComponent],
    template: `
        @if (session.dryRun()) {
            <mosaik-message variant="info" header="Dry run is on" [content]="text()" />
        }
    `,
    styles: ':host { display: contents; }',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DryRunNoticeComponent {

    // #region Properties

    /**
     * Gets the session of the app.
     *
     * @readonly
     */
    protected readonly session = inject(ShellSession);

    /**
     * Says what dry run means on this screen.
     *
     * @readonly
     */
    public readonly text = input('Changes wait in Review until you turn off dry run in the title bar. Nothing is written to your repository.');

    // #endregion

}
