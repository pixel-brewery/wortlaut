// #region Imports

import type { EventEmitter } from 'events';

// #endregion

/**
 * Represents a record type with a `value` property.
 *
 * @public
 */
export type Match = Record<string, string> & { value?: string };

/**
 * @public
 */
export namespace Match {
  export const EMPTY: Match = {};
}

/**
 * Event map for the `IDetector`.
 *
 * @public
 */
export interface IDetectorEventMap {
  detected: [change: IDetectorResult];
  failed: [error: any];
}

/**
 * Result of a detector extraction.
 *
 * @public
 */
export interface IDetectorResult {
  isStatic: boolean;
  lineNumber: number;
  columnNumber: number;
  match: Match;
  context: string;

  /**
   * Where the value stands in its line, exactly as the source spells it. The value in `match` is unescaped and trimmed,
   * so only this says what a rewrite has to replace.
   */
  position?: IDetectorPosition;
}

/**
 * The position of a detected value in its line.
 *
 * @public
 */
export interface IDetectorPosition {
  start: number;
  end: number;
  raw: string;
}

interface IDetectorResourceKeyOptions {
  /**
   * The prefix for resource keys.
   *
   * @default ''
   */
  prefix?: string;

  /**
   * The suffix for resource keys.
   *
   * @default ''
   */
  suffix?: string;
}

export interface IDetectOptions extends Record<string, unknown> {
  // #region Properties

  /**
   * The resource key check configuration for the detector.
   */
  resourceKey?: IDetectorResourceKeyOptions;

  // #endregion
}

/**
 * Interface for detectors that extract translatable strings from content.
 *
 * @public
 */
export interface IDetector extends Pick<EventEmitter<IDetectorEventMap>, 'on'> {
  // #region Methods

  /**
   * Detects content and extracts translatable strings.
   *
   * @param content The content to detect.
   * @param options The optional detector options.
   * @returns An array of extracted results.
   */
  detect(content: string, options?: IDetectOptions): Array<IDetectorResult>;

  // #endregion
}
