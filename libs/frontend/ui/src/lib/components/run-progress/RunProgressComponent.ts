// #region Imports

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ProgressBarComponent } from '@pixel-brewery/mosaik-elements-angular/components/progress-bar';
import type { ActiveRun } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * A run that is going on: how far it is, and the way to stop it. The run lives in main, so this shows the same after a
 * reload of the renderer.
 */
@Component({
    selector: 'wortlaut-run-progress',
    imports: [ButtonComponent, CardComponent, ProgressBarComponent],
    template: `
        <mosaik-card>
            <div slot="content" class="card-box">
                <div class="run-line">
                    <span class="run-phase">{{ run().phase }}</span>
                    <mosaik-button label="Cancel" variant="neutral" appearance="outline" size="small" (click)="cancel.emit()" />
                </div>
                <mosaik-progress-bar [min]="0" [max]="run().total || 1" [value]="run().completed" [attr.aria-label]="run().phase" />
                <span class="note run-detail">{{ note() }}</span>
            </div>
        </mosaik-card>
    `,
    styles: `
        :host { display: flex; flex-direction: column; }
        .run-line { display: flex; align-items: center; justify-content: space-between; gap: var(--mosaik-layout-space); }
        .run-phase { font: var(--mosaik-typography-subtitle2); }
        .run-detail { overflow-wrap: anywhere; }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RunProgressComponent {

    // #region Properties

    /**
     * Gets the run.
     *
     * @readonly
     */
    public readonly run = input.required<ActiveRun>();

    /**
     * Asks to stop the run.
     *
     * @readonly
     */
    public readonly cancel = output();

    /**
     * Gets the line below the bar.
     *
     * @readonly
     */
    protected readonly note = computed(() => {
        const { completed, total, detail } = this.run();

        return [total > 0 ? `${completed} of ${total}` : null, detail].filter((part) => part !== null).join(' · ');
    });

    // #endregion

}
