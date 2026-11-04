// #region Imports

import { Pipe, type PipeTransform } from '@angular/core';
import { localeFlagIcon } from './localeFlagIcon';

// #endregion

/**
 * Resolves catalog locale identifiers to the flag names registered for Mosaik controls.
 *
 * @public
 */
@Pipe({ name: 'localeFlag', pure: true })
export class LocaleFlagPipe implements PipeTransform {

    // #region Methods

    /**
     * @public
     * @param code The catalog locale.
     * @returns Its flag name, or `undefined` when the locale has no supported flag.
     */
    public transform(code: string | null | undefined): string | undefined {
        return localeFlagIcon(code);
    }

    // #endregion

}
