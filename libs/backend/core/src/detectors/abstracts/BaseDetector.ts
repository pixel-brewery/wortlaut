// #region Imports

import { type ILogger, t } from '@pixel-brewery/utilities';
import { EventEmitter } from 'events';
import {
  type IDetectOptions,
  type IDetector,
  type IDetectorEventMap,
  type IDetectorResult,
  Match,
} from '../interfaces/IDetector.js';
import { isResourceKey } from '../Utils.js';

// #endregion

/**
 * Options for configuring the `BaseDetector`.
 *
 * @public
 */
export interface IBaseDetectorOptions extends IDetectOptions {
  // #region Properties

  /**
   * Enable debug logging (default: `false`).
   * @default false
   */
  debug?: boolean;

  // #endregion
}

export const DEFAULT_DETECTOR_OPTIONS: Required<IBaseDetectorOptions> = {
  debug: false,
  resourceKey: {
    prefix: '',
    suffix: '',
  },
};

/**
 * Abstract base detector providing common logic for content parsing.
 *
 * @public
 */
export abstract class BaseDetector extends EventEmitter<IDetectorEventMap> implements IDetector {
  // #region Fields

  private readonly _debug: boolean;
  private readonly _resourceKey: {
    prefix: string;
    suffix: string;
  };
  private readonly _logger: ILogger;

  // #endregion

  // #region Constructor

  /**
   * Constructs a new instance of the `BaseDetector` class.
   *
   * @public
   * @param logger The logger.
   * @param options The optional configuration for the detector.
   */
  protected constructor(logger: ILogger, options?: IBaseDetectorOptions) {
    super({ captureRejections: true });

    options = {
      ...DEFAULT_DETECTOR_OPTIONS,
      ...options,
    };

    this._logger = logger;
    this._debug = options.debug ?? DEFAULT_DETECTOR_OPTIONS.debug;
    this._resourceKey = {
      prefix: options.resourceKey?.prefix ?? DEFAULT_DETECTOR_OPTIONS.resourceKey.prefix ?? '',
      suffix: options.resourceKey?.suffix ?? DEFAULT_DETECTOR_OPTIONS.resourceKey.suffix ?? '',
    };
  }

  // #endregion

  // #region Properties

  /**
   * Indicates whether debug logging is enabled.
   *
   * @public
   */
  public get debug(): boolean {
    return this._debug;
  }

  // #endregion

  // #region Methods

  /**
   * Detects content and extracts translatable strings.
   *
   * @public
   * @param content The content to detect.
   * @param options The optional detect options.
   * @returns An array of extracted results.
   */
  public detect(content: string, options?: IDetectOptions): Array<IDetectorResult> {
    const prefix = options?.resourceKey?.prefix ?? this._resourceKey.prefix;
    const suffix = options?.resourceKey?.suffix ?? this._resourceKey.suffix;

    try {
      const regexes = this.getRegexes().map((regex) =>
        regex.hasIndices ? regex : new RegExp(regex.source, `${regex.flags}d`),
      );
      const changes: Array<IDetectorResult> = [];
      const lines = content.split('\n');
      // const preparedContent = this.preProcessContent(content);

      lines.forEach((line, lineNumber) => {
        for (const regex of regexes) {
          let match: RegExpExecArray | null = null;
          while ((match = regex.exec(line)) !== null) {
            const candidate = match.groups?.value;
            if (candidate) {
              const range = match.indices?.groups?.value;
              const change: IDetectorResult = {
                lineNumber: lineNumber + 1,
                columnNumber: match.index,
                match: match.groups ?? Match.EMPTY,
                context: line.trim(),
                isStatic: !isResourceKey(candidate, prefix, suffix),
                ...(range
                  ? {
                      position: {
                        start: range[0],
                        end: range[1],
                        raw: line.slice(range[0], range[1]),
                      },
                    }
                  : {}),
              };
              changes.push(change);

              this.emit('detected', change);
            }
          }
        }
      });

      this.log(`Found matches: ${JSON.stringify(changes)}`);
      return this.postProcessResults(changes);
    } catch (error) {
      this.emit('failed', error);
      this.log(`Error during parsing: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Abstract method for retrieving the regex patterns for string extraction.
   *
   * @protected
   * @abstract
   * @returns An array of RegExps for extracting strings.
   */
  protected abstract getRegexes(): Array<RegExp>;

  /**
   * Pre-processes content before applying regex matching.
   *
   * @protected
   * @param content The raw content.
   * @returns The processed content.
   */
  protected preProcessContent(content: string): string {
    return content;
  }

  /**
   * Post-processes results after regex matching.
   *
   * @protected
   * @param results The raw results from regex matching.
   * @returns The processed results.
   */
  protected postProcessResults(results: Array<IDetectorResult>): Array<IDetectorResult> {
    return results;
  }

  /**
   * Logs a message if debugging is enabled.
   *
   * @protected
   * @param message The message to log.
   */
  protected log(message: string): void {
    if (this.debug) {
      this._logger.debug(t`[Detector]: ${message}`);
    }
  }

  // #endregion
}
