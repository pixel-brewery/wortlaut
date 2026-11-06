// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import * as cheerio from 'cheerio';
import { BaseDetector, type IBaseDetectorOptions } from './abstracts/BaseDetector.js';
import { escapeRegExp } from './Utils.js';

// #endregion

/**
 * Options for configuring the `VueDetector`.
 *
 * @public
 */
export interface IVueDetectorOptions extends IBaseDetectorOptions {
  /**
   * The function name or regex used for translation in scripts (default: `/\$t|t/`).
   */
  scriptMarker?: string | RegExp;

  /**
   * The function name or regex used for translation in templates (default: `\$t`).
   */
  templateMarker?: string | RegExp;
}

/**
 * Detector for extracting translatable strings from Vue files.
 *
 * This detector supports translation extraction from:
 * - `<template>` blocks:
 *   ```html
 *   <div>{{ $t('Template string') }}</div>
 *   ```
 * - `<script>` blocks:
 *   ```typescript
 *   $t('Script string');
 *   ```
 *
 * @public
 */
export class VueDetector extends BaseDetector {
  // #region Fields

  private readonly _scriptMarker: string | RegExp;
  private readonly _templateMarker: string | RegExp;

  // #endregion

  // #region Constructor

  /**
   * Constructs a new instance of the `VueDetector` class.
   *
   * @public
   * @param logger The logger to use for logging messages.
   * @param options Configuration for the detector.
   */
  public constructor(logger: ILogger, options?: IVueDetectorOptions) {
    super(logger, options);

    this._scriptMarker = options?.scriptMarker ?? /t|\$t/;
    this._templateMarker = options?.templateMarker ?? /\$t/;
  }

  // #endregion

  // #region Methods

  /**
   * Provides regex patterns for extracting strings from Vue files.
   *
   * @protected
   * @returns An array of regex patterns.
   */
  protected override getRegexes(): Array<RegExp> {
    const templateMarker =
      this._templateMarker instanceof RegExp
        ? this._templateMarker.source
        : escapeRegExp(this._templateMarker);

    const scriptMarker =
      this._scriptMarker instanceof RegExp
        ? this._scriptMarker.source
        : escapeRegExp(this._scriptMarker);

    return [
      // Template Marker
      new RegExp(
        `${templateMarker}\\(` + '\\s*([\'"`])(?<value>(?:\\\\\\1|.)*?)\\1(?:,\\s*\\{.*?\\})?\\)',
        'gs',
      ),
      // Script Marker
      new RegExp(
        `${scriptMarker}\\(` + '\\s*([\'"`])(?<value>(?:\\\\\\1|.)*?)\\1(?:,\\s*\\{.*?\\})?\\)',
        'gs',
      ),
    ];
  }

  /**
   * Pre-processes Vue content by extracting `<template>` and `<script>` blocks.
   *
   * @protected
   * @param content The raw content.
   * @returns The combined content.
   */
  protected override preProcessContent(content: string): string {
    const $ = cheerio.load(content);

    const templateContent = $('template').html() ?? '';
    const scriptContent = $('script').html() ?? '';

    const combinedContent = `
            ${templateContent}
            ${scriptContent}
        `;

    this.log('Pre-processed Vue content.');
    return combinedContent.replace(/\r?\n/g, ' ').trim();
  }

  // #endregion
}
