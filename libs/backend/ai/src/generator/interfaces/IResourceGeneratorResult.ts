// #region Imports

import type { IResourceInfo } from '@pixel-brewery/wortlaut-core';

// #endregion

/**
 * How the translation of a locale ended. `failed` and `stopped` mean the proposal holds only what was finished by then.
 *
 * @public
 */
export type ResourceGeneratorStatus = 'completed' | 'failed' | 'stopped';

/**
 * The proposal for one locale. The generator writes nothing: `resource` holds the content the target file would get.
 *
 * @public
 */
export interface IResourceGeneratorResult {
  // #region Properties

  /**
   * The proposed target resource, at the path of the target file.
   */
  resource: IResourceInfo;

  locale: string;

  status: ResourceGeneratorStatus;

  /**
   * The number of keys that were translated in this run.
   */
  translatedKeys: number;

  /**
   * What a reviewer should know about the proposal, such as a chunk that returned too many or too few models.
   */
  warnings: Array<string>;

  /**
   * The keys whose translation stayed wrong: they were left out of the proposal.
   */
  heldBack?: Array<string>;

  // #endregion
}

/**
 * The result of a generator run. A provider failure or a stop does not throw, so the finished proposals stay available.
 *
 * @public
 */
export interface IResourceGeneratorRun {
  // #region Properties

  /**
   * The overall status: the first locale that did not complete ends the run.
   */
  status: ResourceGeneratorStatus;

  /**
   * The proposals of all locales that have translated keys, or that completed.
   */
  results: Array<IResourceGeneratorResult>;

  /**
   * The failure, when `status` is `failed`.
   */
  error: Error | null;

  // #endregion
}

/**
 * The progress of a generator run, reported when a locale starts and after every finished chunk.
 *
 * @public
 */
export interface IResourceGeneratorProgress {
  // #region Properties

  locale: string;

  completedChunks: number;

  totalChunks: number;

  // #endregion
}
