// #region Imports

import type { IResourceModel } from '@pixel-brewery/wortlaut-core';
import { joinInstructions } from '../prompts/TranslationPrompt.js';

// #endregion

/**
 * What the rules of a prompt add to every chunk, in characters.
 */
const PROMPT_OVERHEAD = 900;

/**
 * How many characters count as a token. Providers count differently, so this is a rough rule and the result an estimate.
 */
const CHARS_PER_TOKEN = 4;

/**
 * What a local assistant adds to every request of its own: its instructions, its tools and what it reads around them. Only
 * Codex was measured, in real runs of 4 and of 10 keys at about 15,000 and 16,000 tokens. Nothing is known about the others, so
 * they stay out of this list instead of getting a number that looks like knowledge.
 */
const ASSISTANT_CONTEXT_PER_CHUNK: Readonly<Record<string, { name: string; tokens: number }>> = {
  codex: { name: 'Codex', tokens: 14000 },
};

/**
 * The local assistants without a measured figure, by their names.
 */
const UNMEASURED_ASSISTANTS: Readonly<Record<string, string>> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
};

/**
 * What a setup would take in tokens, with what that figure covers.
 *
 * @public
 */
export interface ITokenEstimate {
  tokens: number;

  /**
   * The figure counts only what Wortlaut can see, and the provider adds more of its own.
   */
  isLowerBound: boolean;

  /**
   * What the figure covers, in a sentence for the screen.
   */
  note: string;
}

/**
 * Estimates the tokens of translating rows: what goes in and about as much coming back. It is an estimate, and every surface
 * says so.
 *
 * @public
 * @param models The rows.
 * @param chunkCount How many chunks they make.
 * @param instructions The instructions, sent with every chunk.
 * @returns The estimated tokens.
 */
export function estimateTokens(
  models: ReadonlyArray<Pick<IResourceModel, 'key' | 'value' | 'comment'>>,
  chunkCount: number,
  instructions?: string | ReadonlyArray<string>,
): number {
  const rows = models.reduce(
    (sum, model) => sum + model.key.length + model.value.length + (model.comment?.length ?? 0) + 2,
    0,
  );
  const prompt = chunkCount * (PROMPT_OVERHEAD + joinInstructions(instructions).length);

  return Math.ceil((prompt + rows * 2) / CHARS_PER_TOKEN);
}

/**
 * Estimates the tokens of a setup for its provider. An API key provider is asked exactly what Wortlaut sends. A local assistant
 * wraps that in its own context for every chunk, which is most of what such a run costs.
 *
 * @public
 * @param provider The provider.
 * @param models The rows.
 * @param chunkCount How many chunks they make.
 * @param instructions The instructions, sent with every chunk.
 * @returns The estimate and what it covers.
 */
export function estimateTokensFor(
  provider: string,
  models: ReadonlyArray<Pick<IResourceModel, 'key' | 'value' | 'comment'>>,
  chunkCount: number,
  instructions?: string | ReadonlyArray<string>,
): ITokenEstimate {
  const counted = estimateTokens(models, chunkCount, instructions);
  const measured = ASSISTANT_CONTEXT_PER_CHUNK[provider] as
    { name: string; tokens: number } | undefined;

  if (measured) {
    return {
      tokens: counted + chunkCount * measured.tokens,
      isLowerBound: false,
      note: `A rough figure. ${measured.name} adds its own instructions and tools to every chunk, about ${Math.round(measured.tokens / 1000)} k in the runs that were measured, and it can be far off on this computer.`,
    };
  }

  const unmeasured = UNMEASURED_ASSISTANTS[provider] as string | undefined;

  if (unmeasured) {
    return {
      tokens: counted,
      isLowerBound: true,
      note: `Counts your prompt and the answer only. ${unmeasured} adds its own instructions and tools to every chunk, and Wortlaut cannot tell how many that is.`,
    };
  }

  return {
    tokens: counted,
    isLowerBound: false,
    note: 'A rough figure for your prompt and the answer. The provider counts its own way.',
  };
}
