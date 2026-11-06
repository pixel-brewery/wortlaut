// #region Imports

import { z } from 'zod';
import { LocaleTagSchema } from '../../settings/ProjectOptions.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * The providers Wortlaut knows, by the names of the command line.
 *
 * @public
 */
export const AiProviderIdSchema = z.enum(['claude-code', 'codex', 'opencode', 'openai', 'google']);

/**
 * @public
 */
export type AiProviderId = z.output<typeof AiProviderIdSchema>;

/**
 * An AI provider with its true state. Only `ready` can start a run.
 *
 * @public
 */
export const AiProviderSchema = z.strictObject({
  id: AiProviderIdSchema,
  name: z.string(),
  kind: z.enum(['local', 'key']),
  state: z.enum(['ready', 'not-installed', 'signed-out', 'no-key', 'unknown']),

  /**
   * What the state means, in a sentence.
   */
  description: z.string(),
});

/**
 * @public
 */
export type AiProvider = z.output<typeof AiProviderSchema>;

/**
 * An API key on its way into the keychain. It crosses in this one direction only: nothing the renderer receives holds one.
 *
 * @public
 */
export const AiSetKeyRequestSchema = z.strictObject({
  providerId: z.enum(['openai', 'google']),
  key: z.string().min(1).max(4096),
});

/**
 * The result of a test of a key. Its message holds neither the key nor what the provider answered.
 *
 * @public
 */
export const AiKeyTestSchema = z.strictObject({
  ok: z.boolean(),
  message: z.string(),
});

/**
 * @public
 */
export type AiKeyTest = z.output<typeof AiKeyTestSchema>;

/**
 * The models of a provider. A local assistant uses its own model settings, so it lists none.
 *
 * @public
 */
export const AiModelsSchema = z.strictObject({
  models: z.array(z.string()),
});

/**
 * @public
 */
export type AiModels = z.output<typeof AiModelsSchema>;

/**
 * What happens between the answer of a model and the files of a project.
 *
 * @public
 */
export const AiSafetySchema = z.strictObject({
  reviewBeforeWriting: z.boolean(),
  protectPlaceholders: z.boolean(),
  keepPartialResults: z.boolean(),
  keepRawOutput: z.boolean(),
});

/**
 * @public
 */
export type AiSafety = z.output<typeof AiSafetySchema>;

/**
 * The starting values of a run. The provider lives in the profile, because logins and keys belong to the computer, and
 * everything else in the configuration of the repository, so the command line reads the same.
 *
 * @public
 */
export const AiDefaultsSchema = z.strictObject({
  defaultProvider: AiProviderIdSchema.nullable(),
  model: z.string(),
  temperature: z.number().min(0).max(1),
  chunkSize: z.number().int().min(1).max(100),
  limit: z.number().int().positive().nullable(),
  instructions: z.string(),
  localeInstructions: z.record(z.string(), z.string()),
  safety: AiSafetySchema,

  /**
   * The target locales of the project, each with a field of its own.
   */
  locales: z.array(z.string()),

  /**
   * The file the values go to, as a display value.
   */
  sourceFile: z.string(),
});

/**
 * @public
 */
export type AiDefaults = z.output<typeof AiDefaultsSchema>;

/**
 * What Settings: AI saves.
 *
 * @public
 */
export const AiDefaultsChangesSchema = AiDefaultsSchema.pick({
  model: true,
  temperature: true,
  chunkSize: true,
  limit: true,
  instructions: true,
  localeInstructions: true,
  safety: true,
});

/**
 * @public
 */
export type AiDefaultsChanges = z.output<typeof AiDefaultsChangesSchema>;

/**
 * Which keys a run translates.
 *
 * @public
 */
export const GenerateScopeSchema = z.enum(['all', 'new', 'missing']);

/**
 * The setup of a run of Generate. A key never stands in it: main holds it.
 *
 * @public
 */
export const GenerateInputSchema = z.strictObject({
  locales: z.array(LocaleTagSchema).min(1).max(64),
  scope: GenerateScopeSchema,

  /**
   * Only the keys below this namespace, as the whole start of the key.
   */
  namespace: z.string().max(300).nullable(),

  /**
   * Only these keys, for a run that started from a finding of Analyze.
   */
  keys: z.array(z.string().max(1000)).max(20000).nullable(),
  limit: z.number().int().positive().nullable(),
  provider: AiProviderIdSchema,

  /**
   * The model of an API key provider. A local assistant uses its own, so this is empty there.
   */
  model: z.string().max(200),
  temperature: z.number().min(0).max(1),
  chunkSize: z.number().int().min(1).max(100),
  instructions: z.string().max(20000),
  reviewBeforeWriting: z.boolean(),
  protectPlaceholders: z.boolean(),
});

/**
 * @public
 */
export type GenerateInput = z.output<typeof GenerateInputSchema>;

/**
 * What the set up of Generate starts from.
 *
 * @public
 */
export const GenerateOverviewSchema = z.strictObject({
  baseLocale: z.string(),
  format: z.string(),
  keyCount: z.number().int().nonnegative(),
  targets: z.array(
    z.strictObject({
      locale: z.string(),
      isNew: z.boolean(),
      missing: z.number().int().nonnegative(),
      identical: z.number().int().nonnegative(),
      selected: z.boolean(),
    }),
  ),
  namespaces: z.array(
    z.strictObject({
      name: z.string(),

      /**
       * The whole start of the keys below this namespace.
       */
      path: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  defaults: AiDefaultsSchema,

  /**
   * The run that is going on for this project.
   */
  activeRunId: IdSchema.nullable(),

  /**
   * The last run of this project since the app started.
   */
  latestRunId: IdSchema.nullable(),
});

/**
 * @public
 */
export type GenerateOverview = z.output<typeof GenerateOverviewSchema>;

/**
 * What a setup would take. The tokens are an estimate, and every surface says so.
 *
 * @public
 */
export const GenerateEstimateSchema = z.strictObject({
  keys: z.number().int().nonnegative(),
  chunks: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),

  /**
   * The figure counts only what Wortlaut can see, and the provider adds more of its own.
   */
  tokensAreLowerBound: z.boolean(),

  /**
   * What the figure covers, in a sentence for the screen.
   */
  tokensNote: z.string(),
});

/**
 * @public
 */
export type GenerateEstimate = z.output<typeof GenerateEstimateSchema>;

/**
 * The command line that does the same as a setup: `command` runs and holds everything, `shown` is what fits on a screen.
 *
 * @public
 */
export const GenerateCommandSchema = z.strictObject({
  command: z.string(),
  shown: z.string(),
});

/**
 * @public
 */
export type GenerateCommand = z.output<typeof GenerateCommandSchema>;

/**
 * Asks about a setup that is not running yet.
 *
 * @public
 */
export const GenerateSetupRequestSchema = z.strictObject({
  projectId: IdSchema,
  input: GenerateInputSchema,
});

/**
 * Asks about a setup that may still lack a locale, as the view has it while the user fills it in.
 *
 * @public
 */
export const GenerateDraftRequestSchema = z.strictObject({
  projectId: IdSchema,
  input: GenerateInputSchema.extend({ locales: z.array(LocaleTagSchema).max(64) }),
});

/**
 * The states of a run of Generate.
 *
 * @public
 */
export const GenerateStatusSchema = z.enum(['running', 'paused', 'failed', 'stopped', 'done']);

/**
 * @public
 */
export type GenerateStatus = z.output<typeof GenerateStatusSchema>;

/**
 * A row of the review of a run.
 *
 * @public
 */
export const GenerateRowSchema = z.strictObject({
  key: z.string(),
  base: z.string(),
  value: z.string(),

  /**
   * What is wrong with the value, or what a reviewer should look at.
   */
  note: z.string().nullable(),
  severity: z.enum(['none', 'warning', 'danger']),
  accepted: z.boolean(),

  /**
   * With Protect placeholders on, a value with wrong placeholders cannot be accepted until an edit corrects it.
   */
  canAccept: z.boolean(),
  written: z.boolean(),
});

/**
 * @public
 */
export type GenerateRow = z.output<typeof GenerateRowSchema>;

/**
 * The automatic checks of a locale.
 *
 * @public
 */
export const GenerateCheckSchema = z.strictObject({
  id: z.enum(['placeholders', 'row-count', 'identical', 'keys']),
  title: z.string(),
  text: z.string(),
  severity: z.enum(['success', 'warning', 'danger']),
});

/**
 * @public
 */
export type GenerateCheck = z.output<typeof GenerateCheckSchema>;

/**
 * What a run of one locale has come to.
 *
 * @public
 */
export const GenerateLocaleProgressSchema = z.strictObject({
  locale: z.string(),
  status: z.enum(['waiting', 'running', 'failed', 'stopped', 'done']),

  /**
   * The target file, as a display value.
   */
  target: z.string(),
  doneKeys: z.number().int().nonnegative(),
  totalKeys: z.number().int().nonnegative(),
  doneChunks: z.number().int().nonnegative(),
  totalChunks: z.number().int().nonnegative(),

  /**
   * One state per chunk, in their order.
   */
  chunks: z.array(z.enum(['waiting', 'running', 'done', 'failed'])),
  estimatedTokens: z.number().int().nonnegative(),
  needsAttention: z.number().int().nonnegative(),
  writable: z.number().int().nonnegative(),
});

/**
 * @public
 */
export type GenerateLocaleProgress = z.output<typeof GenerateLocaleProgressSchema>;

/**
 * A run of Generate as its view shows it. It lives in main, so a reload of the renderer finds it again.
 *
 * @public
 */
export const GenerateRunSchema = z.strictObject({
  runId: IdSchema,
  projectId: IdSchema,
  status: GenerateStatusSchema,

  /**
   * A failed chunk, numbered from one, with the reason of the provider.
   */
  failure: z
    .strictObject({
      locale: z.string(),
      chunk: z.number().int().positive(),
      message: z.string(),

      /**
       * The run waits, and can go on from this chunk. A run that could not start cannot.
       */
      canResume: z.boolean(),
    })
    .nullable(),
  dryRun: z.boolean(),
  provider: AiProviderSchema.pick({ id: true, name: true, kind: true }),
  baseLocale: z.string(),
  input: GenerateInputSchema,
  startedAt: z.iso.datetime(),
  elapsedMs: z.number().int().nonnegative(),
  locales: z.array(GenerateLocaleProgressSchema),

  /**
   * The locale whose rows and checks this answer holds.
   */
  locale: z.string(),
  rows: z.array(GenerateRowSchema),
  checks: z.array(GenerateCheckSchema),
  log: z.array(z.string()),

  /**
   * The pending change set that holds what is not written yet.
   */
  changeSetId: IdSchema.nullable(),

  /**
   * The change set holds only what a failed or stopped run finished.
   */
  partial: z.boolean(),
});

/**
 * @public
 */
export type GenerateRun = z.output<typeof GenerateRunSchema>;

/**
 * Changes a row of the review. An edit validates again.
 *
 * @public
 */
export const GenerateRowChangeSchema = z.strictObject({
  runId: IdSchema,
  locale: z.string().max(40),
  key: z.string().max(1000),
  value: z.string().max(100000).optional(),
  accepted: z.boolean().optional(),
});

/**
 * One of the two setups of the test lab.
 *
 * @public
 */
export const TestSetupSchema = z.strictObject({
  provider: AiProviderIdSchema,
  model: z.string().max(200),
  temperature: z.number().min(0).max(1),
});

/**
 * @public
 */
export type TestSetup = z.output<typeof TestSetupSchema>;

/**
 * Asks for the sample of the test lab, from the real keys of a project.
 *
 * @public
 */
export const TestSampleRequestSchema = z.strictObject({
  projectId: IdSchema,
  namespace: z.string().max(300).nullable(),
  size: z.number().int().min(1).max(100),
});

/**
 * The sample of the test lab.
 *
 * @public
 */
export const TestSampleSchema = z.strictObject({
  baseLocale: z.string(),
  locales: z.array(z.string()),
  namespaces: z.array(
    z.strictObject({ name: z.string(), path: z.string(), count: z.number().int().nonnegative() }),
  ),
  rows: z.array(z.strictObject({ key: z.string(), base: z.string(), comment: z.string() })),
  instructions: z.string(),
});

/**
 * @public
 */
export type TestSample = z.output<typeof TestSampleSchema>;

/**
 * Asks to compare two setups on a sample. Nothing is written, and no change set is built.
 *
 * @public
 */
export const TestTranslateRequestSchema = z.strictObject({
  projectId: IdSchema,
  locale: LocaleTagSchema,
  rows: z
    .array(
      z.strictObject({
        key: z.string().max(1000),
        base: z.string().max(10000),
        comment: z.string().max(10000),
      }),
    )
    .min(1)
    .max(200),
  setups: z.array(TestSetupSchema).length(2),
  instructions: z.string().max(20000),
});

/**
 * @public
 */
export type TestTranslateRequest = z.output<typeof TestTranslateRequestSchema>;

/**
 * How a comparison stands. It lives in main, so a reload finds it again.
 *
 * @public
 */
export const TestTranslationSchema = z.strictObject({
  id: IdSchema,
  isRunning: z.boolean(),
  locale: z.string(),
  rows: z.array(z.strictObject({ key: z.string(), base: z.string() })),
  setups: z.array(
    z.strictObject({
      name: z.enum(['A', 'B']),
      provider: AiProviderIdSchema,
      providerName: z.string(),
      model: z.string(),
      temperature: z.number(),
      status: z.enum(['running', 'done', 'failed', 'stopped']),
      durationMs: z.number().int().nonnegative().nullable(),

      /**
       * What the provider reported, or an estimate, or `null` when neither is known.
       */
      estimatedTokens: z.number().int().nonnegative().nullable(),
      issues: z.number().int().nonnegative(),
      failure: z.string().nullable(),
      results: z.array(
        z.strictObject({
          key: z.string(),
          value: z.string().nullable(),
          note: z.string().nullable(),
        }),
      ),
    }),
  ),
});

/**
 * @public
 */
export type TestTranslation = z.output<typeof TestTranslationSchema>;

/**
 * Asks to suggest a value for one key.
 *
 * @public
 */
export const AiSuggestValueRequestSchema = z.strictObject({
  requestId: z.uuid(),
  projectId: IdSchema,
  key: z.string().max(1000),
  locale: z.string().max(40),

  /**
   * The comment in the editor, which may not be saved yet.
   */
  comment: z.string().max(10000),
});

/**
 * A suggested value. It stays a proposal until the user applies it, and even then it only fills the editor.
 *
 * @public
 */
export const AiValueProposalSchema = z.strictObject({
  value: z.string(),
  providerName: z.string(),

  /**
   * What is wrong with the placeholders, or `null` when they match.
   */
  problem: z.string().nullable(),
});

/**
 * @public
 */
export type AiValueProposal = z.output<typeof AiValueProposalSchema>;

/**
 * Asks to name the keys of rows of a scan.
 *
 * @public
 */
export const AiNameKeysRequestSchema = z.strictObject({
  requestId: z.uuid(),
  projectId: IdSchema,
  scanId: IdSchema,
  rowIds: z.array(IdSchema).min(1).max(500),
});

/**
 * Proposed names of keys. The view shows them in place of the generated keys, and nothing is written.
 *
 * @public
 */
export const AiKeyNamesSchema = z.strictObject({
  names: z.array(z.strictObject({ rowId: IdSchema, key: z.string() })),
  providerName: z.string(),
  dropped: z.array(z.string()),
});

/**
 * @public
 */
export type AiKeyNames = z.output<typeof AiKeyNamesSchema>;

/**
 * Asks to propose patterns for keys no source mentions.
 *
 * @public
 */
export const AiSuggestPatternsRequestSchema = z.strictObject({
  requestId: z.uuid(),
  projectId: IdSchema,
  keys: z.array(z.string().max(1000)).min(1).max(2000),
});

/**
 * Proposed patterns, each with what it covers.
 *
 * @public
 */
export const AiPatternProposalsSchema = z.strictObject({
  patterns: z.array(
    z.strictObject({ pattern: z.string(), matchCount: z.number().int().nonnegative() }),
  ),
  providerName: z.string(),
  dropped: z.array(z.string()),
});

/**
 * @public
 */
export type AiPatternProposals = z.output<typeof AiPatternProposalsSchema>;
