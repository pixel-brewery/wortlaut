// #region Imports

import type { IFormatter, IFormatterResult } from './interfaces/IFormatter.js';

// #endregion

/**
 * Formatter for outputting extracted strings in RESX format.
 *
 * @public
 */
export class ResxFormatter implements IFormatter {

    // #region Fields

    private readonly _indent: number;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ResxFormatter` class.
     *
     * @public
     */
    public constructor(options?: { indent: number }) {
        this._indent = options?.indent ?? 2;
    }

    // #endregion

    /**
     * Formats extracted strings into the RESX XML format.
     *
     * @public
     * @param strings A record of string keys and their values.
     * @returns The formatted output as a RESX string.
     */
    public format(strings: Record<string, string>): IFormatterResult {
        const escapeXml = (value: string): string => value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const content = `<?xml version="1.0" encoding="utf-8"?>
<root>
${Object.entries(strings).map(([key, value]) => `    <data name="${escapeXml(key)}" xml:space="preserve">
        <value>${escapeXml(value)}</value>
    </data>`)
    .join('\n')}
</root>`;

        return {
            content: content,
            changes: strings
        };
    }

}
