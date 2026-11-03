// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { BaseDetector, type IBaseDetectorOptions } from './abstracts/BaseDetector.js';
import type { IDetectorResult } from './interfaces/IDetector.js';
import { escapeRegExp } from './Utils.js';

// #endregion

/**
 * Options for configuring the `AngularHTMLDetector`.
 *
 * @public
 */
export interface IAngularHTMLDetectorOptions extends IBaseDetectorOptions {

    /**
     * The pipe name used for translation (default: `translate`).
     */
    marker?: string;

}

/**
 * Detector for extracting translatable strings from Angular HTML files.
 *
 * This detector supports the following Angular-specific cases:
 *
 * - **Text Interpolation**:
 *   Extracts strings inside `{{ ... }}` with the specified pipe.
 *   ```html
 *   <label>{{ 'This is a sentence' | translate }}</label>
 *   ```
 *
 * - **Attribute Binding**:
 *   Extracts strings in Angular attribute bindings.
 *   ```html
 *   <my-component [label]="'This is a label' | translate"></my-component>
 *   ```
 *
 * - **Event Binding**:
 *   Extracts strings from event bindings.
 *   ```html
 *   <button (click)="doSomething('This is a key' | translate)">Click Me</button>
 *   ```
 *
 * - **Structural Directives**:
 *   Extracts strings in Angular structural directives like `*ngIf`.
 *   ```html
 *   <div *ngIf="'This is a condition' | translate as conditionText">
 *       {{ conditionText }}
 *   </div>
 *   ```
 *
 * - **Content Projection**:
 *   Extracts strings inside `<ng-content>` blocks.
 *   ```html
 *   <ng-content select="[label]">{{ 'Default translation' | translate }}</ng-content>
 *   ```
 *
 * - **JSON-like Configurations**:
 *   Extracts strings inside JSON-like structures.
 *   ```html
 *   <div [config]="{ label: 'This is a translatable label' | translate }"></div>
 *   ```
 *
 * @public
 */
export class AngularHTMLDetector extends BaseDetector {

    // #region Fields

    private readonly _marker: string;

    // #endregion

    // #region Constructor

    /**
     * Constructs a new instance of the `AngularHTMLDetector` class.
     *
     * @public
     * @param logger The logger.
     * @param options Configuration options for the detector.
     */
    public constructor(logger: ILogger, options?: IAngularHTMLDetectorOptions) {
        super(logger, options);
        this._marker = options?.marker ?? 'translate';
    }

    // #endregion

    // #region Methods

    /**
     * Provides the regex patterns for extracting strings from Angular HTML.
     *
     * @protected
     * @returns An array of regex patterns.
     */
    protected override getRegexes(): Array<RegExp> {
        const marker = escapeRegExp(this._marker);

        return [
            // Text Interpolation
            new RegExp(`\\{\\{\\s*['"](?<value>.+?)['"]\\s*\\|\\s*${marker}\\s*\\}\\}`, 'g'),
            // Attribute Binding
            new RegExp(`\\[.*?\\]\\s*=\\s*"'(?<value>[^']*?)'\\s*\\|\\s*${marker}"`, 'g'),
            // Event Binding
            new RegExp(`\\(.*?\\)\\s*=\\s*".*?\\('(?<value>[^']*?)'\\s*\\|\\s*${marker}\\)"`, 'g'),
            // Structural Directives
            new RegExp(`\\*\\w+\\s*=\\s*"'(?<value>[^']*?)'\\s*\\|\\s*${marker}\\s+as\\s+\\w+"`, 'g'),
            // JSON-like Configurations
            new RegExp(`\\[.*?\\]\\s*=\\s*"\\{.*?:\\s*'(?<value>[^']*?)'\\s*\\|\\s*${marker}\\s*\\}"`, 'g'),
            // Content Projection
            new RegExp(`<ng-content.*?>\\s*['"](?<value>.+?)['"]\\s*\\|\\s*${marker}\\s*<\\/ng-content>`, 'g')
        ];
    }

    /**
     * Pre-processes the Angular HTML content to normalize it.
     *
     * @protected
     * @param content The raw content.
     * @returns The processed content.
     */
    protected override preProcessContent(content: string): string {
        this.log('Pre-processing Angular HTML content.');
        return content.replace(/\r?\n/g, ' ').trim();
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

        // Remove empty matches
        return results.filter((result) => {
            if (result.match.value !== undefined) {
                return result.match.value.trim().length > 0;
            }

            return false;
        });
    }

    // #endregion

}
