export type {
  IResourceGeneratorOptions,
  ResourceGeneratorKeyScope,
} from './generator/interfaces/IResourceGeneratorOptions.js';
export type {
  IResourceGeneratorProgress,
  IResourceGeneratorResult,
  IResourceGeneratorRun,
  ResourceGeneratorStatus,
} from './generator/interfaces/IResourceGeneratorResult.js';
export { ResourceGenerator, type ITranslationPlan } from './generator/ResourceGenerator.js';
export type {
  ICompletionRequest,
  IResourceGeneratorStrategy,
  ITranscribeOptions,
} from './generator/strategies/interfaces/IResourceGeneratorStrategy.js';
export type { IResourceGeneratorStrategyConfig } from './generator/strategies/interfaces/IResourceGeneratorStrategyConfig.js';
export { ProviderError } from './generator/strategies/abstracts/BaseResourceGeneratorStrategy.js';
export { ChatGptResourceGeneratorStrategy } from './generator/strategies/ChatGptResourceGeneratorStrategy.js';
export { GeminiResourceGeneratorStrategy } from './generator/strategies/GeminiResourceGeneratorStrategy.js';
export {
  LocalAssistantResourceGeneratorStrategy,
  readRows,
  type ILocalAssistant,
  type ILocalAssistantAnswer,
  type ILocalAssistantTurn,
} from './generator/strategies/LocalAssistantResourceGeneratorStrategy.js';
export {
  ChunkRejectedError,
  DEFAULT_RETRY_BUDGET,
  isRetryable,
  translateChunk,
  type IChunkReport,
  type IChunkRequest,
} from './generator/ChunkTranslator.js';
export {
  runTranslation,
  type ITranslationGate,
  type ITranslationOutcome,
  type ITranslationRunInit,
} from './generator/TranslationRunner.js';
export {
  estimateTokens,
  estimateTokensFor,
  type ITokenEstimate,
} from './generator/TokenEstimate.js';
export {
  buildTranslationPrompt,
  dataBlock,
  joinInstructions,
  promptText,
  type ITranslationPrompt,
  type ITranslationPromptInput,
} from './prompts/TranslationPrompt.js';
export {
  describePlaceholderProblem,
  validateChunk,
  type ChunkIssueKind,
  type IChunkIssue,
  type IChunkValidation,
  type IValidatedRow,
} from './validation/ChunkValidator.js';
export { locateAssistant } from './assistants/AssistantLocator.js';
export {
  createOwnLoginRunner,
  installHintOf,
  LocalAssistants,
  type ILocalAssistantsInit,
  type ILocalAssistantStatus,
  type ISynapseModules,
  type LocalAssistantId,
  type LocalAssistantState,
} from './assistants/LocalAssistants.js';
export {
  AiProviderHost,
  canonicalProviderId,
  isLocalAssistant,
  type AiProviderState,
  type IAiProviderHost,
  type IAiProviderHostInit,
  type IAiProviderInfo,
  type IAiStrategyConfig,
  type IApiKeySource,
  type IPreparedStrategy,
} from './providers/AiProviderHost.js';
export { createEnvironmentKeySource, readEnvironmentKey } from './providers/EnvironmentKeys.js';
export {
  knownModels,
  listModels,
  testKey,
  type FetchLike,
  type IKeyRequest,
  type IKeyTest,
  type KeyProviderId,
} from './providers/KeyProviders.js';
export {
  checkKeyName,
  nameKeys,
  suggestPatterns,
  suggestValue,
  type IKeyNameProposal,
  type IPatternProposal,
  type IProposals,
  type IValueProposal,
} from './proposals/AiProposals.js';
