// #region Imports

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ReviewFile } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The diff of a file of a change, on Review and on Review update alike.
 */
@Component({
    selector: 'wortlaut-file-diff',
    templateUrl: './FileDiffComponent.html',
    styleUrl: './FileDiffComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileDiffComponent {

    // #region Properties

    /**
     * Gets the file with its diff.
     *
     * @readonly
     */
    public readonly file = input.required<ReviewFile>();

    // #endregion

}
