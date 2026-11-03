// #region Imports

import type { IDetector } from '../../detectors/interfaces/IDetector.js';

// #endregion

/**
 * Interface for framework presets that provide specific parsers.
 *
 * @public
 */
export interface IFrameworkPreset {

    // #region Methods

    /**
     * Returns a parser for a specific file extension.
     *
     * @param extension The file extension.
     * @returns The parser.
     */
    getParser(extension: string): IDetector;

    /**
     * Returns parsers mapped to file extensions.
     *
     * @returns A mapping of file extensions to parsers.
     */
    getParsers(): Record<string, IDetector>;

    /**
     * Returns the extensions supported by the preset.
     *
     * @returns An array of supported extensions.
     */
    getExtensions(): Array<string>;

    // #endregion

}
