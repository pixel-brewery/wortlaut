// #region Imports

import { z } from 'zod';
import { RuleSeveritySchema } from '../rulepacks/RulePack.js';

// #endregion

/**
 * A locale tag. A locale names a file, so a tag holds no path.
 *
 * @public
 */
export const LocaleTagSchema = z.string().regex(/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/);

/**
 * The catalog formats Wortlaut can read.
 *
 * @public
 */
export const ResourceFormatSchema = z.enum(['json', 'resx', 'po']);

/**
 * The formats Wortlaut can write. TypeScript is output only.
 *
 * @public
 */
export const ResourceTargetSchema = z.enum(['json', 'resx', 'po', 'ts']);

/**
 * The framework presets.
 *
 * @public
 */
export const PresetSchema = z.enum(['angular', 'lit', 'react', 'stencil', 'vue']);

/**
 * How `generate` selects the keys to translate: `all` of them, only the `new` ones the target lacks, or the `missing`
 * ones, which the target lacks or holds identical to the base locale.
 *
 * @public
 */
export const KeyScopeSchema = z.enum(['all', 'new', 'missing']);

/**
 * The options of a project, in the same shape as the options of the Nx executor, so the same settings work in `nx.json`,
 * `project.json`, `wortlaut.config.json` and `localizator.config.json`. A string may be a token such as
 * `{env.GEMINI_API_KEY}`. Unknown options are removed, because Nx targets may carry options of their own.
 *
 * @public
 */
export const ProjectOptionsSchema = z
  .object({
    verbose: z.boolean(),
    dryRun: z.boolean(),
    review: z.boolean(),
    output: z.string(),
    mode: z.string(),
    envFile: z.string(),
    env: z.record(z.string(), z.string()),
    cache: z
      .object({
        enabled: z.boolean(),
        dirPath: z.string(),
      })
      .partial(),
    actions: z
      .object({
        detect: z
          .object({
            languages: z.array(LocaleTagSchema),
            root: z.string(),
            resourceRoot: z.union([z.string(), z.array(z.string())]),
            preset: z.union([PresetSchema, z.literal('')]),
            type: ResourceFormatSchema,
            resourceKey: z
              .object({
                prefix: z.string(),
                suffix: z.string(),
              })
              .partial(),
          })
          .partial(),
        sort: z
          .object({
            order: z.enum(['asc', 'desc']),
          })
          .partial(),
        analyze: z
          .object({
            rules: z.array(z.string()),
            usedKeys: z.array(z.string()),
            baseLocale: LocaleTagSchema,
            expectedLocales: z.array(LocaleTagSchema),
            identicalKeys: z.array(z.string()),
            identicalValues: z.array(z.string()),

            /**
             * What each rule is worth. `off` means it does not run. This is the one value behind the switch of a rule in
             * Settings: project and its severity in Rule packs.
             */
            severities: z.record(z.string(), RuleSeveritySchema),

            /**
             * Keys one rule leaves alone, by the id of the rule, for rules without an exception list of their own.
             */
            ruleExceptions: z.record(z.string(), z.array(z.string())),

            /**
             * The rule packs of the lock file that do not run in this project.
             */
            disabledPacks: z.array(z.string()),
          })
          .partial(),
        transform: z
          .object({
            types: z.array(ResourceTargetSchema),
          })
          .partial(),
        generate: z
          .object({
            apiKey: z.string(),
            model: z.string(),
            temperature: z.number(),
            locales: z.array(LocaleTagSchema),
            baseLocale: LocaleTagSchema,
            chunkSize: z.number().int().positive(),
            limit: z.number().int().positive().nullable(),
            instructions: z.union([z.string(), z.array(z.string())]),
            onlyNew: z.boolean(),
            scope: KeyScopeSchema,
            namespace: z.string(),
            keys: z.array(z.string()),
            strategy: z.string(),
            localeInstructions: z.record(z.string(), z.string()),
            reviewBeforeWriting: z.boolean(),
            protectPlaceholders: z.boolean(),
            keepPartialResults: z.boolean(),
            keepRawOutput: z.boolean(),
          })
          .partial(),
      })
      .partial(),
  })
  .partial();

/**
 * @public
 */
export type ProjectOptions = z.output<typeof ProjectOptionsSchema>;
