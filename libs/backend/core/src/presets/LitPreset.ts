// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import type { IDetector } from '../detectors/interfaces/IDetector.js';
import { TypeScriptDetector } from '../detectors/TypeScriptDetector.js';
import type { IFrameworkPreset } from './interfaces/IFrameworkPreset.js';

// #endregion

/**
 * Preset for Lit applications.
 *
 * @public
 */
export class LitPreset implements IFrameworkPreset {

    // #region Fields

    private readonly _parsers: Record<string, IDetector>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `LitPreset` class.
     *
     * @public
     * @param logger The logger.
     */
    public constructor(logger: ILogger) {
        this._parsers = {
            '.ts': new TypeScriptDetector(logger)
        };
    }

    // #endregion

    // #region Methods

    /**
     * Returns parsers mapped to file extensions.
     *
     * @returns A mapping of file extensions to parsers.
     */
    public getParsers(): Record<string, IDetector> {
        return this._parsers;
    }

    /**
     * Returns a parser for a specific file extension.
     *
     * @param extension The file extension.
     * @returns The parser.
     */
    public getParser(extension: string): IDetector {
        return this._parsers[extension];
    }

    /**
     * Returns the extensions supported by the preset.
     *
     * @returns An array of supported extensions.
     */
    public getExtensions(): Array<string> {
        return Object.keys(this._parsers);
    }

    // #endregion

}
