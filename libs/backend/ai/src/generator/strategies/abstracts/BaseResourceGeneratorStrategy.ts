// #region Imports

import type { IFileSystem } from '@pixel-brewery/utilities';
import type { IResourceInfo, IResourceModel } from '@pixel-brewery/wortlaut-core';
import { EventEmitter } from 'events';
import {
  buildTranslationPrompt,
  type ITranslationPrompt,
} from '../../../prompts/TranslationPrompt.js';
import type {
  ICompletionRequest,
  IResourceGeneratorStrategy,
  IResourceGeneratorStrategyEventMap,
  ITranscribeOptions,
} from '../interfaces/IResourceGeneratorStrategy.js';
import type { IResourceGeneratorStrategyConfig } from '../interfaces/IResourceGeneratorStrategyConfig.js';

// #endregion

/**
 * A failure of a provider. Its message holds no key, and its cause says whether another attempt can help.
 *
 * @public
 */
export class ProviderError extends Error {
  /**
   * Constructs a new instance of the `ProviderError` class.
   *
   * @public
   * @param message The message.
   * @param cause The failure of the provider.
   */
  public constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'ProviderError';
  }
}

/**
 * Abstract base class for AI-based resource generation strategies.
 *
 * @public
 */
export abstract class BaseResourceGeneratorStrategy
  extends EventEmitter<IResourceGeneratorStrategyEventMap>
  implements IResourceGeneratorStrategy
{
  // #region Fields

  private readonly _fileSystem: IFileSystem;
  private readonly _config: IResourceGeneratorStrategyConfig;

  // #endregion

  // #region Constructor

  /**
   * Constructs a new instance of the `BaseResourceGeneratorStrategy` class.
   *
   * @protected
   * @param fileSystem The service to handle file operations.
   * @param config The configuration for the strategy.
   */
  protected constructor(fileSystem: IFileSystem, config: IResourceGeneratorStrategyConfig) {
    super();

    this._fileSystem = fileSystem;
    this._config = config;
  }

  // #endregion

  // #region Properties

  /**
   * Returns the `config` property.
   *
   * @public
   * @readonly
   */
  public get config(): IResourceGeneratorStrategyConfig {
    return this._config;
  }

  // #endregion

  // #region Methods

  /**
   * Transcribes a resource to the specified locale.
   *
   * @public
   * @param data The resource and models to transcribe.
   * @param locale The target locale.
   * @param options What goes with the call.
   * @returns The answer of the model, which the caller has to check.
   */
  public async transcribe(
    data: {
      resource: IResourceInfo;
      models: Array<IResourceModel>;
    },
    locale: string,
    options?: ITranscribeOptions,
  ): Promise<Array<IResourceModel>> {
    const prompt = buildTranslationPrompt({
      type: data.resource.type,
      baseLocale: data.resource.locale,
      locale,
      models: data.models,
      instructions: options?.instructions ?? this.config.instructions,
      feedback: options?.feedback,
    });

    this.emit('start');

    try {
      return await this.processResource(prompt, options);
    } catch (error) {
      throw new ProviderError(
        this.scrub(error instanceof Error ? error.message : String(error)),
        error,
      );
    } finally {
      this.emit('end');
    }
  }

  /**
   * Asks a free question.
   *
   * @public
   * @param request The question.
   * @returns The answer as text.
   */
  public async complete(request: ICompletionRequest): Promise<string> {
    try {
      return await this.processCompletion(request);
    } catch (error) {
      throw new ProviderError(
        this.scrub(error instanceof Error ? error.message : String(error)),
        error,
      );
    }
  }

  /**
   * Processes a resource using the specified strategy.
   *
   * @protected
   * @abstract
   * @param prompt The prompt to process.
   * @param options What goes with the call.
   * @returns The answer of the model.
   */
  protected abstract processResource(
    prompt: ITranslationPrompt,
    options?: ITranscribeOptions,
  ): Promise<Array<IResourceModel>>;

  /**
   * Answers a free question.
   *
   * @protected
   * @abstract
   * @param request The question.
   * @returns The answer as text.
   */
  protected abstract processCompletion(request: ICompletionRequest): Promise<string>;

  /**
   * Removes the key from a message, because a provider may echo a request.
   *
   * @private
   */
  private scrub(message: string): string {
    const key = this.config.apiKey;

    return key ? message.split(key).join('***') : message;
  }

  // #endregion
}
