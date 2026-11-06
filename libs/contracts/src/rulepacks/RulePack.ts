// #region Imports

import { z } from 'zod';

// #endregion

/**
 * The file that makes a folder, a repository or a package a rule pack.
 *
 * @public
 */
export const RULE_PACK_FILE_NAME = 'wortlaut-pack.json';

/**
 * What a rule is worth. `off` means it does not run.
 *
 * @public
 */
export const RuleSeveritySchema = z.enum(['error', 'warning', 'off']);

/**
 * @public
 */
export type RuleSeverity = z.output<typeof RuleSeveritySchema>;

/**
 * The name of a pack or of a rule. It becomes part of a path and of a command line, so it has only one spelling.
 */
const SlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Write it in lowercase words joined by hyphens.')
  .max(64);

/**
 * Text from a pack reaches a terminal and a window. It has no control characters, so it cannot move a cursor or fake a line.
 */
function text(max: number): z.ZodString {
  return (
    z
      .string()
      .min(1)
      .max(max)
      // eslint-disable-next-line no-control-regex
      .regex(/^[^\u0000-\u001f\u007f-\u009f]*$/, 'Control characters are not allowed.')
  );
}

/**
 * A rule that looks for a regular expression in a key or a value. The evaluator bounds how long it may run.
 *
 * @public
 */
export const RulePatternSchema = z.strictObject({
  regex: z.string().min(1).max(512),

  /**
   * Only flags that keep a test free of state.
   */
  flags: z
    .string()
    .regex(/^[imsu]{0,4}$/, 'Only the flags i, m, s and u are allowed.')
    .optional(),

  target: z.enum(['value', 'key']).optional(),

  /**
   * Whether a match is the finding, or the lack of one.
   */
  when: z.enum(['match', 'no-match']).optional(),
});

/**
 * A rule that limits the length of a value, in characters.
 *
 * @public
 */
export const RuleLimitSchema = z
  .strictObject({
    minLength: z.number().int().nonnegative().max(1000000).optional(),
    maxLength: z.number().int().positive().max(1000000).optional(),
  })
  .refine(
    (limit) => limit.minLength !== undefined || limit.maxLength !== undefined,
    'A limit names minLength or maxLength.',
  );

/**
 * The checks of the engine that a pack may name, because patterns and limits cannot express them. A pack can only name one
 * of these: it brings no logic of its own.
 *
 * @public
 */
export const RuleCheckSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('icu-parsing') }),
  z.strictObject({ name: z.literal('placeholder-comparison') }),
  z.strictObject({
    name: z.literal('length-ratio'),
    maxRatio: z.number().gt(1).max(100),

    /**
     * Base values shorter than this are left out: a short word says nothing about a layout.
     */
    minBaseLength: z.number().int().nonnegative().max(10000).optional(),
  }),
  z.strictObject({ name: z.literal('punctuation') }),
]);

/**
 * Narrows a rule to some keys and locales.
 *
 * @public
 */
export const RuleScopeSchema = z.strictObject({
  /**
   * Patterns of keys, where `*` matches any sequence of characters.
   */
  keys: z.array(z.string().min(1).max(512)).max(64).optional(),
  locales: z.array(z.string().min(1).max(40)).max(64).optional(),
});

/**
 * One declarative rule: exactly one of a pattern, a limit or a named check, with what it says and what it is worth.
 *
 * @public
 */
export const RuleDefinitionSchema = z
  .strictObject({
    id: SlugSchema,
    description: text(300),
    severity: RuleSeveritySchema.optional(),

    /**
     * What the result card says while the rule fails, with `{count}`, `{locale}` and `{baseLocale}`.
     */
    title: text(200).optional(),
    message: text(1000),

    /**
     * What the result card says when the rule passes.
     */
    passTitle: text(200).optional(),
    passMessage: text(1000).optional(),

    /**
     * The name of the second column of the result table.
     */
    column: text(80).optional(),

    scope: RuleScopeSchema.optional(),
    pattern: RulePatternSchema.optional(),
    limit: RuleLimitSchema.optional(),
    check: RuleCheckSchema.optional(),
  })
  .superRefine((rule, context) => {
    if ([rule.pattern, rule.limit, rule.check].filter((part) => part !== undefined).length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'A rule has exactly one of pattern, limit and check.',
      });
    }
  });

/**
 * @public
 */
export type RuleDefinition = z.output<typeof RuleDefinitionSchema>;

/**
 * The definition file of a rule pack. It is data: patterns, limits, messages, severities and names of engine checks. Unknown
 * fields are refused, so nothing a pack says can go unnoticed.
 *
 * @public
 */
export const RulePackManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: SlugSchema,
  name: text(120),
  description: text(500),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'Write the version like 1.2.0.')
    .max(64),
  rules: z.array(RuleDefinitionSchema).min(1).max(200),
});

/**
 * @public
 */
export type RulePackManifest = z.output<typeof RulePackManifestSchema>;

/**
 * A content hash, with the name of its algorithm.
 */
const ContentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/**
 * What the lock file pins of one pack. The hash of every rule is there, so a diff of this file shows which rules changed.
 *
 * @public
 */
export const RuleLockEntrySchema = z.strictObject({
  name: text(120),

  /**
   * Where the pack comes from: `github:owner/repository`, `npm:name`, `folder:relative/path` or `wortlaut:id`.
   */
  source: z.string().min(1).max(512),
  version: z.string().max(64).nullable(),

  /**
   * The commit of a GitHub pack. A folder and a package have none and are pinned by their hash alone.
   */
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/)
    .nullable(),
  hash: ContentHashSchema,
  rules: z.record(SlugSchema, ContentHashSchema),
});

/**
 * @public
 */
export type RuleLockEntry = z.output<typeof RuleLockEntrySchema>;

/**
 * `wortlaut.lock.json`, with `localizator.lock.json` as its fallback: the packs of a repository, pinned for everyone.
 *
 * @public
 */
export const RuleLockSchema = z.strictObject({
  schemaVersion: z.literal(1),
  packs: z.record(SlugSchema, RuleLockEntrySchema),
});

/**
 * @public
 */
export type RuleLock = z.output<typeof RuleLockSchema>;
