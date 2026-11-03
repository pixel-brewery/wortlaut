// #region Imports

import { PoText } from '../resources/text/PoText.js';
import type { IFormatter, IFormatterResult } from './interfaces/IFormatter.js';

// #endregion

/**
 * Formatter for outputting extracted strings in PO format.
 *
 * @public
 */
export class PoFormatter implements IFormatter {

    // #region Methods

    /**
     * Formats extracted strings into the PO format.
     *
     * @public
     * @param strings A record of string keys and their values.
     * @returns The formatted output as a PO string.
     */
    public format(strings: Record<string, string>): IFormatterResult {
        const entries = Object.entries(strings).map(([key, value]) => `msgid "${PoText.escape(key)}"\nmsgstr "${PoText.escape(value)}"\n`);

        return {
            content: [`msgid ""\nmsgstr "${PoText.escape(PoText.header(''))}"\n`, ...entries].join('\n'),
            changes: strings
        };
    }

    // #endregion

}
