// #region Imports

import type { IResourceInfo, IResourceModel } from '@pixel-brewery/wortlaut-core';
import type EventEmitter from 'events';

// #endregion

/**
 * Event map for the `BaseParser`.
 *
 * @public
 */
export interface IResourceGeneratorStrategyEventMap {
  start: [];
  end: [];
}

/**
 * What goes with a call of a strategy.
 *
 * @public
 */
export interface ITranscribeOptions {
  /**
   * Cancels a call in flight.
   */
  signal?: AbortSignal;

  /**
   * The instructions of this call, instead of those of the strategy.
   */
  instructions?: string | ReadonlyArray<string>;

  /**
   * Why the last answer was rejected.
   */
  feedback?: string;

  /**
   * Receives the raw answer.
   */
  onRaw?: (text: string) => void;

  /**
   * Receives the tokens the provider reports.
   */
  onUsage?: (tokens: number) => void;
}

/**
 * A free question, for proposals that are no translation of a chunk.
 *
 * @public
 */
export interface ICompletionRequest {
  system: string;
  content: string;
  signal?: AbortSignal;
  onUsage?: (tokens: number) => void;
}

/**
 * Represents the `IResourceGeneratorStrategy` interface.
 *
 * @public
 */
export interface IResourceGeneratorStrategy extends Pick<
  EventEmitter<IResourceGeneratorStrategyEventMap>,
  'on'
> {
  // #region Methods

  /**
   * Transcribes a resource to the specified locale.
   *
   * @public
   * @param data The resource to translate.
   * @param locale The target locale.
   * @param options What goes with the call.
   * @returns The answer of the model, which the caller has to check.
   */
  transcribe(
    data: {
      resource: IResourceInfo;
      models: Array<IResourceModel>;
    },
    locale: string,
    options?: ITranscribeOptions,
  ): Promise<Array<IResourceModel>>;

  /**
   * Asks a free question.
   *
   * @public
   * @param request The question.
   * @returns The answer as text, which the caller has to check.
   */
  complete?(request: ICompletionRequest): Promise<string>;

  // #endregion
}
