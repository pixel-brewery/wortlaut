// #region Imports

import type { IFileSystem } from '@pixel-brewery/utilities';
import type { IResourceModel } from '@pixel-brewery/wortlaut-core';
import { promptText, type ITranslationPrompt } from '../../prompts/TranslationPrompt.js';
import { RESOURCE_MODEL_SCHEMA } from '../schemas/ResourceModelSchema.js';
import { BaseResourceGeneratorStrategy } from './abstracts/BaseResourceGeneratorStrategy.js';
import type { ICompletionRequest, ITranscribeOptions } from './interfaces/IResourceGeneratorStrategy.js';

// #endregion

/**
 * The shape an assistant is asked to answer in, where it supports that. A tool that returns JSON wants an object at its root.
 */
const ROWS_SCHEMA = {
    type: 'object',
    properties: { rows: { type: 'array', items: RESOURCE_MODEL_SCHEMA } },
    required: ['rows'],
    additionalProperties: false
} as const;

/**
 * One turn of a local assistant.
 *
 * @public
 */
export interface ILocalAssistantTurn {
    prompt: string;
    outputSchema?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
}

/**
 * What a local assistant answered.
 *
 * @public
 */
export interface ILocalAssistantAnswer {
    text: string;
    structured?: unknown;
    tokens: number | null;
}

/**
 * What the strategy needs of a local assistant. It does not know how the assistant is composed: the surface that hosts the
 * run hands it over.
 *
 * @public
 */
export interface ILocalAssistant {
    run(turn: ILocalAssistantTurn): Promise<ILocalAssistantAnswer>;
}

/**
 * Reads the rows out of the text of an answer: an assistant may wrap its JSON in prose or a fence. What it finds is still
 * untrusted, so the caller checks it.
 *
 * @public
 * @param text The answer.
 * @returns The rows.
 * @throws Error when the text holds no JSON with rows.
 */
export function readRows(text: string): unknown {
    const start = text.search(/[[{]/);

    if (start < 0) {
        throw new Error('The answer holds no JSON.');
    }

    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));

    return Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown } | null)?.rows ?? parsed;
}

/**
 * Translates through an assistant installed on this computer, with its own login. A key is never involved.
 *
 * @public
 */
export class LocalAssistantResourceGeneratorStrategy extends BaseResourceGeneratorStrategy {

    // #region Fields

    private readonly _assistant: ILocalAssistant;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `LocalAssistantResourceGeneratorStrategy` class.
     *
     * @public
     * @param fileSystem The service to handle file operations.
     * @param assistant The assistant, composed by the surface.
     * @param instructions The instructions of the project.
     */
    public constructor(fileSystem: IFileSystem, assistant: ILocalAssistant, instructions: string | Array<string> = '') {
        super(fileSystem, { apiKey: '', model: '', temperature: 0, instructions });

        this._assistant = assistant;
    }

    // #endregion

    // #region Methods

    /**
     * @protected
     * @override
     */
    protected override async processResource(prompt: ITranslationPrompt, options?: ITranscribeOptions): Promise<Array<IResourceModel>> {
        const answer = await this._assistant.run({ prompt: promptText(prompt), outputSchema: ROWS_SCHEMA, signal: options?.signal });

        options?.onRaw?.(answer.text);

        if (answer.tokens !== null) {
            options?.onUsage?.(answer.tokens);
        }

        const structured = (answer.structured as { rows?: unknown } | null | undefined)?.rows;

        return (structured ?? readRows(answer.text)) as Array<IResourceModel>;
    }

    /**
     * @protected
     * @override
     */
    protected override async processCompletion(request: ICompletionRequest): Promise<string> {
        const answer = await this._assistant.run({ prompt: promptText(request), signal: request.signal });

        if (answer.tokens !== null) {
            request.onUsage?.(answer.tokens);
        }

        return answer.text;
    }

    // #endregion

}
