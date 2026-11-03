// #region Imports

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WorkspaceColor } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The short code of a workspace on its color.
 */
@Component({
    selector: 'wortlaut-workspace-tile',
    template: '{{ code() }}',
    styleUrl: './WorkspaceTileComponent.scss',
    host: {
        '[attr.data-color]': 'color()',
        '[attr.data-size]': 'size()',
        'aria-hidden': 'true'
    },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceTileComponent {

    // #region Properties

    /**
     * The short code.
     *
     * @readonly
     */
    public readonly code = input.required<string>();

    /**
     * The color.
     *
     * @readonly
     */
    public readonly color = input.required<WorkspaceColor>();

    /**
     * The size, as the boards draw it.
     *
     * @readonly
     */
    public readonly size = input<'small' | 'medium' | 'large'>('medium');

    // #endregion

}
