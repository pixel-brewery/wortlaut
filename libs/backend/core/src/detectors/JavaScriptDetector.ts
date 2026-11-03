// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { BaseDetector, type IBaseDetectorOptions } from './abstracts/BaseDetector.js';
import type { IDetectorResult } from './interfaces/IDetector.js';
import { escapeRegExp } from './Utils.js';

// #endregion

/**
 * Options for configuring the `JavaScriptDetector`.
 *
 * @public
 */
export interface IJavaScriptDetectorOptions extends IBaseDetectorOptions {

    /**
     * The function name or regex used for translation (default: `/t|translate/`).
     */
    marker?: string | RegExp;

}

/**
 * Detector for extracting translatable strings from JavaScript files.
 *
 * This detector supports the following scenarios:
 * - **Simple Function Calls**:
 *   ```javascript
 *   t("This is a translatable string");
 *   translate("Another translatable string");
 *   ```
 * - **Multiline Strings**:
 *   ```javascript
 *   t("This is a \
 *      multiline string");
 *   ```
 * - **Template Literals**:
 *   ```javascript
 *   translate(`This is a translatable template literal`);
 *   ```
 * - **Function Calls with Context**:
 *   ```javascript
 *   t("This is translatable", { context: "example" });
 *   ```
 *
 * @public
 */
export class JavaScriptDetector extends BaseDetector {

    // #region Fields

    private readonly _marker: string | RegExp;

    // #endregion

    // #region Constructor

    /**
     * Constructs a new instance of the `JavaScriptDetector` class.
     *
     * @public
     * @param logger The logger.
     * @param options Configuration options for the detector.
     */
    public constructor(logger: ILogger, options?: IJavaScriptDetectorOptions) {
        super(logger, options);

        this._marker = options?.marker ?? /t|translate/;
    }

    // #endregion

    // #region Methods

    /**
     * Provides the regex patterns for extracting strings from JavaScript content.
     *
     * @protected
     * @returns A RegExp for extracting strings.
     */
    protected override getRegexes(): Array<RegExp> {
        const functionPattern =
            this._marker instanceof RegExp
                ? this._marker.source
                : escapeRegExp(this._marker);

        return [
            new RegExp(
                `(?<function>${functionPattern})` + // Function name
                '\\(' + // Opening parenthesis
                '\\s*' + // Optional whitespace
                "(?<quote>['\"`])" + // Quote type
                '(?<value>(?:\\\\.|[^\\\\])*?)' + // Content inside quotes, including escaped quotes
                '\\k<quote>' + // Match the same quote type
                '(?:,\\s*(?<context>\\{.*?\\}))?' + // Optional context object
                '\\)', // Closing parenthesis
                'gs'
            )
        ];
    }

    /**
     * Pre-processes content before applying regex matching.
     *
     * @protected
     * @param content The raw content.
     * @returns The processed content.
     */
    protected override preProcessContent(content: string): string {
        this.log('Pre-processing JavaScript content.');
        return content.replace(/\r?\n/g, ' '); // Normalize multiline strings
    }

    /**
     * Post-processes results after regex matching.
     *
     * @protected
     * @param results The raw results from regex matching.
     * @returns The processed results.
     */
    protected override postProcessResults(results: Array<IDetectorResult>): Array<IDetectorResult> {
        this.log(`Post-processing results: ${JSON.stringify(results)}`);

        return results
            .filter((result) => result.match.value !== undefined)
            .map((result) => {
                if (result.match.value !== undefined) {
                    result.match.value = result.match.value
                        .replace(/\\"/g, '"')   // Unescape double quotes
                        .replace(/\\'/g, "'")   // Unescape single quotes
                        .trim();                // Remove extra whitespace
                }

                return result;
            });
    }

    // #endregion

}
