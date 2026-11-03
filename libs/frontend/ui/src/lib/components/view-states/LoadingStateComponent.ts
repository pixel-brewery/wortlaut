// #region Imports

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BusyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/busy';

// #endregion

/**
 * The state of a view while its data loads. Its text goes through the slot, because the element does not render a header
 * property that changes after its first render.
 */
@Component({
    selector: 'wortlaut-loading-state',
    imports: [BusyStateComponent],
    template: '<div class="state-frame"><mosaik-busy-state><span slot="header" class="state-title">{{ label() }}</span></mosaik-busy-state></div>',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingStateComponent {

    // #region Properties

    /**
     * Says what is loading.
     *
     * @readonly
     */
    public readonly label = input('Loading');

    // #endregion

}
