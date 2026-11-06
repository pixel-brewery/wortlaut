// #region Imports

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { IFileSystem } from '@pixel-brewery/utilities';
import type { IResourceModel } from '@pixel-brewery/wortlaut-core';
import { Output, generateText, jsonSchema } from 'ai';
import type { ITranslationPrompt } from '../../prompts/TranslationPrompt.js';
import { RESOURCE_MODEL_SCHEMA } from '../schemas/ResourceModelSchema.js';
import { BaseResourceGeneratorStrategy } from './abstracts/BaseResourceGeneratorStrategy.js';
import type {
  ICompletionRequest,
  ITranscribeOptions,
} from './interfaces/IResourceGeneratorStrategy.js';
import type { IResourceGeneratorStrategyConfig } from './interfaces/IResourceGeneratorStrategyConfig.js';

// #endregion

/**
 * Service to handle AI-based translations using Gemini.
 *
 * @public
 */
export class GeminiResourceGeneratorStrategy extends BaseResourceGeneratorStrategy {
  // #region Fields

  private readonly _googleProvider: ReturnType<typeof createGoogleGenerativeAI>;

  // #endregion

  // #region Constructor

  /**
   * Constructs a new instance of the `{@link GeminiResourceGeneratorStrategy}` class
   *
   * @param fileSystem The service to handle file operations
   * @param options The configuration options for the strategy
   */
  public constructor(fileSystem: IFileSystem, options: IResourceGeneratorStrategyConfig) {
    super(fileSystem, options);

    this._googleProvider = createGoogleGenerativeAI({
      apiKey: this.config.apiKey,
      ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
    });
  }

  // #endregion

  // #region Methods

  /**
   * Translates a resource to the specified locale. The rules and instructions go to the system part and the catalog text
   * to the prompt, so nothing in a catalog can pass for an instruction. The retry budget lives in the caller.
   *
   * @protected
   * @override
   * @param prompt The prompt to translate
   * @param options What goes with the call
   * @returns The answer of the model
   */
  protected override async processResource(
    prompt: ITranslationPrompt,
    options?: ITranscribeOptions,
  ): Promise<Array<IResourceModel>> {
    const result = await generateText({
      model: this._googleProvider(this.config.model),
      output: Output.array({
        element: jsonSchema<IResourceModel>(RESOURCE_MODEL_SCHEMA),
        name: 'ResourceModel',
        description: 'A translated key-value resource model with key, value, and comment.',
      }),
      system: prompt.system,
      prompt: prompt.content,
      temperature: this.config.temperature,
      maxRetries: 0,
      abortSignal: options?.signal,
    });

    options?.onUsage?.(result.usage.totalTokens ?? 0);
    options?.onRaw?.(result.text);

    return result.output;
  }

  /**
   * Answers a free question.
   *
   * @protected
   * @override
   * @param request The question
   * @returns The answer as text
   */
  protected override async processCompletion(request: ICompletionRequest): Promise<string> {
    const result = await generateText({
      model: this._googleProvider(this.config.model),
      system: request.system,
      prompt: request.content,
      temperature: this.config.temperature,
      maxRetries: 0,
      abortSignal: request.signal,
    });

    request.onUsage?.(result.usage.totalTokens ?? 0);

    return result.text;
  }

  // #endregion
}
