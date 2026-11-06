// #region Imports

import { z } from 'zod';
import { RuleSeveritySchema } from '../../rulepacks/RulePack.js';
import { WriteOutcomeSchema } from './CommandDtos.js';
import { ReviewFileSchema } from './ReviewDtos.js';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * What a rule pack may do, derived from its definitions.
 *
 * @public
 */
export const RulePackAccessSchema = z.strictObject({
  declarative: z.boolean(),
  readsCatalogs: z.boolean(),
  readsSource: z.boolean(),
  network: z.boolean(),
  ai: z.boolean(),
});

/**
 * @public
 */
export type RulePackAccess = z.output<typeof RulePackAccessSchema>;

/**
 * Where a pack comes from, as the renderer can name it: a folder only by the token of a native dialog.
 *
 * @public
 */
export const RulePackSourceRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('github'), value: z.string().min(1).max(300) }),
  z.strictObject({ kind: z.literal('npm'), value: z.string().min(1).max(300) }),
  z.strictObject({ kind: z.literal('shipped'), value: z.string().min(1).max(300) }),
  z.strictObject({ kind: z.literal('folder'), folderToken: z.uuid() }),
]);

/**
 * @public
 */
export type RulePackSourceRequest = z.output<typeof RulePackSourceRequestSchema>;

/**
 * Why a pack cannot be installed, in words for the screen.
 *
 * @public
 */
export const RulePackProblemSchema = z.strictObject({
  kind: z.enum([
    'not-found',
    'not-a-pack',
    'has-code',
    'invalid',
    'unsafe',
    'too-large',
    'network',
  ]),
  message: z.string(),

  /**
   * The definitions that are wrong, one line each.
   */
  details: z.array(z.string()),
});

/**
 * @public
 */
export type RulePackProblem = z.output<typeof RulePackProblemSchema>;

/**
 * Where a checked pack can go.
 *
 * @public
 */
export const RulePackTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workspace'), workspaceId: IdSchema }),
  z.strictObject({ kind: z.literal('project'), projectId: IdSchema }),
]);

/**
 * @public
 */
export type RulePackTarget = z.output<typeof RulePackTargetSchema>;

/**
 * A choice of Add to.
 *
 * @public
 */
export const RulePackTargetChoiceSchema = z.strictObject({
  target: RulePackTargetSchema,
  label: z.string(),
});

/**
 * @public
 */
export type RulePackTargetChoice = z.output<typeof RulePackTargetChoiceSchema>;

/**
 * The result of Check pack: what the pack is and may do, or why it is refused. Nothing of it ran.
 *
 * @public
 */
export const RulePackCheckSchema = z.strictObject({
  /**
   * Names the checked pack for Install and pin, or `null` when it cannot be installed.
   */
  checkId: IdSchema.nullable(),

  /**
   * The source as a command line names it.
   */
  source: z.string(),

  /**
   * The command that does the same, or `null` when there is nothing to do.
   */
  sameAs: z.string().nullable(),
  problem: RulePackProblemSchema.nullable(),
  pack: z
    .strictObject({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      version: z.string(),
      commit: z.string().nullable(),
      hash: z.string(),
      rules: z.array(
        z.strictObject({ id: z.string(), description: z.string(), severity: RuleSeveritySchema }),
      ),
      access: RulePackAccessSchema,
    })
    .nullable(),

  /**
   * Where this pack can be pinned for everyone.
   */
  targets: z.array(RulePackTargetChoiceSchema),

  /**
   * Why it can go nowhere, such as a folder outside of every repository.
   */
  targetsNote: z.string().nullable(),
});

/**
 * @public
 */
export type RulePackCheck = z.output<typeof RulePackCheckSchema>;

/**
 * What a write of a pack did, one change set per repository.
 *
 * @public
 */
export const RulePackWriteSchema = z.strictObject({
  results: z.array(
    z.strictObject({
      repository: z.string(),
      outcome: WriteOutcomeSchema.nullable(),
      failure: z.string().nullable(),
    }),
  ),
});

/**
 * @public
 */
export type RulePackWrite = z.output<typeof RulePackWriteSchema>;

/**
 * Why a pack failed its verification against the lock file. Its rules do not run.
 *
 * @public
 */
export const RulePackRefusalSchema = z.strictObject({
  reason: z.string(),
  repository: z.string().nullable(),
  pinnedHash: z.string().nullable(),
  foundHash: z.string().nullable(),
});

/**
 * @public
 */
export type RulePackRefusal = z.output<typeof RulePackRefusalSchema>;

/**
 * A rule of a pack as Rule packs shows it.
 *
 * @public
 */
export const RulePackRuleSchema = z.strictObject({
  id: z.string(),
  description: z.string(),
  severity: RuleSeveritySchema,

  /**
   * The latest result per project, summed up, such as `2 projects failing`.
   */
  result: z.string(),
  variant: z.enum(['success', 'warning', 'danger', 'neutral']),
});

/**
 * @public
 */
export type RulePackRule = z.output<typeof RulePackRuleSchema>;

/**
 * A pack of a workspace. Its source fields are display values.
 *
 * @public
 */
export const RulePackEntrySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  locked: z.boolean(),
  enabled: z.boolean(),
  rules: z.array(RulePackRuleSchema),
  refusal: RulePackRefusalSchema.nullable(),
  source: z.string(),
  version: z.string().nullable(),
  commit: z.string().nullable(),
  hash: z.string().nullable(),
  access: RulePackAccessSchema,

  /**
   * The repositories of the workspace that pin it.
   */
  repositories: z.array(z.string()),
});

/**
 * @public
 */
export type RulePackEntry = z.output<typeof RulePackEntrySchema>;

/**
 * A pack that can be added.
 *
 * @public
 */
export const RulePackAvailableSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  source: z.string(),
});

/**
 * @public
 */
export type RulePackAvailable = z.output<typeof RulePackAvailableSchema>;

/**
 * What changes for a rule between the pinned pack and a new one.
 *
 * @public
 */
export const RulePackRuleChangeSchema = z.strictObject({
  id: z.string(),
  change: z.enum(['added', 'changed', 'removed']),
  description: z.string(),
});

/**
 * @public
 */
export type RulePackRuleChange = z.output<typeof RulePackRuleChangeSchema>;

/**
 * What Review update shows: the new commit and the rule changes, as a change to the lock file per repository. Nothing is
 * written until the user approves it.
 *
 * @public
 */
export const RulePackUpdateSchema = z.strictObject({
  packId: z.string(),
  name: z.string(),
  available: z.boolean(),

  /**
   * Why no answer came from the source. The pack stays as it is pinned.
   */
  failure: z.string().nullable(),

  /**
   * Names what was fetched for this review, so approving writes exactly that.
   */
  updateId: IdSchema.nullable(),
  summary: z.string(),
  next: z
    .strictObject({
      version: z.string().nullable(),
      commit: z.string().nullable(),
      hash: z.string(),
    })
    .nullable(),
  access: RulePackAccessSchema.nullable(),
  rules: z.array(RulePackRuleChangeSchema),
  repositories: z.array(
    z.strictObject({
      repository: z.string(),
      commit: z.string().nullable(),
      version: z.string().nullable(),
      hash: z.string(),
      files: z.array(ReviewFileSchema),
    }),
  ),
});

/**
 * @public
 */
export type RulePackUpdate = z.output<typeof RulePackUpdateSchema>;
