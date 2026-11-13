// #region Imports

import {
  ArrayExtensions,
  bold,
  magenta,
  Path,
  StringExtensions,
  symbol,
  t,
} from '@pixel-brewery/utilities';
import type { Finding } from '@pixel-brewery/wortlaut-contracts';
import {
  foundItemsOf,
  isTestFile,
  KeyPatternStoppedError,
  PatternGuard,
  Presets,
  ResourceAnalyzer,
  ResourceReader,
  UsedKeysFinder,
  type IAnalyzerRuleResult,
  type IResourceInfo,
} from '@pixel-brewery/wortlaut-core';
import { basename, resolve } from 'node:path';
import { hashText, type ResultCache } from '../cache/ResultCache.js';
import { EngineError } from '../errors/EngineError.js';
import type { IAnalyzeOptions } from '../interfaces/ICommandOptions.js';
import { RulePackLoader, type ILoadedPacks } from '../rulepacks/RulePackLoader.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The name of the finding that says a pack failed its verification.
 */
const VERIFICATION_RULE = 'rule-pack-verification';

/**
 * The rules whose result depends on nothing but the catalog they look at. Every other rule, a rule of a pack included, may compare
 * catalogs, so a change to any catalog of the project is a change to its input.
 */
const SINGLE_CATALOG_RULES: ReadonlySet<string> = new Set([
  'duplicate-keys',
  'duplicate-values',
  'empty-values',
]);

/**
 * What the key of a cached rule result holds for one analysis.
 */
interface IAnalysisInputs {
  cache: ResultCache;
  catalogs: ReadonlyMap<IResourceInfo, { path: string; hash: string }>;
  all: string;
  settings: unknown;
}

/**
 * What an analysis says about severities and packs, once a project uses them. A repository without a lock file and without
 * severities gets none of this, and its report stays what it always was.
 *
 * @public
 */
export interface IAnalysisGate {
  errors: number;
  warnings: number;
  refusedPacks: Array<{ pack: string; reason: string }>;
}

/**
 * Runs the analyzer rules on the catalogs. It only reads.
 *
 * @internal
 */
export class AnalyzeUseCase implements IUseCase<IAnalyzeOptions, Array<IAnalyzerRuleResult>> {
  public readonly command = 'analyze';

  /**
   * @override
   */
  public async execute(
    options: IAnalyzeOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<Array<IAnalyzerRuleResult>>> {
    const { logger, fileSystem } = context;

    await context.checkpoint('Reading the catalogs', 0, 1, null);

    logger.log(t`Running analyzer on resources...${StringExtensions.newLine}`);

    const analyzer = new ResourceAnalyzer(logger);
    const packs = RulePackLoader.load(resolve(context.cwd), options.disabledPacks ?? []);
    const refusedPacks = this.refusalsOf(packs);
    const guard = new PatternGuard();
    const packRules = RulePackLoader.registerRules(analyzer, packs.packs, guard);
    const usesSeverities =
      packs.directory !== null || Object.keys(options.severities ?? {}).length > 0;
    const results = new Array<IAnalyzerRuleResult>();
    const findings = new Array<Finding>();
    const rows = new Array<{
      rule: string;
      file: string;
      locale: string;
      success: boolean;
      message: string;
      details: unknown;
    }>();
    const resources = new ResourceReader(logger, fileSystem).scanDirectory(
      options.resourceRoot,
      options.type,
    );

    this.requireExpectedLocales(options.expectedLocales ?? [], resources);

    const keys = Array.from(new Set(resources.flatMap((resource) => resource.keys())));
    const sources = await this.readSources(options, context);
    const rules = this.resolveRules(options, analyzer, sources.length > 0, packRules, packs);
    const findUsedKeys = (): Array<string> =>
      Array.from(
        new UsedKeysFinder().find(
          sources,
          keys,
          {
            prefix: options.resourceKeyPrefix,
            usedKeys: options.usedKeys,
          },
          guard,
        ),
      ).sort((a, b) => a.localeCompare(b));
    let usedKeys: ReadonlyArray<string> = [];
    let stopped: string | null = null;

    try {
      usedKeys = context.cache
        ? context.cache.remember(
            'analyze.used-keys.bounded',
            {
              sources: sources.map(hashText),
              keys,
              prefix: options.resourceKeyPrefix,
              usedKeys: options.usedKeys,
            },
            findUsedKeys,
          )
        : findUsedKeys();
    } catch (error) {
      if (!(error instanceof KeyPatternStoppedError)) {
        throw error;
      }

      stopped = error.message;

      if (!rules.includes('unused-keys')) {
        logger.error(stopped);
        findings.push({
          rule: 'used-key-pattern',
          severity: 'error',
          message: stopped,
          file: null,
          locale: null,
        });
      }
    }

    const inputs = context.cache
      ? this.inputsOf(context.cache, options, resources, packs, usedKeys, context)
      : null;

    for (const refusal of refusedPacks) {
      logger.error(`The rule pack ${refusal.pack} was refused: ${refusal.reason}`);
      findings.push({
        rule: VERIFICATION_RULE,
        severity: 'error',
        message: `The rule pack ${refusal.pack} was refused: ${refusal.reason}`,
        file: packs.lock?.path ?? null,
        locale: null,
      });
    }

    logger.log(t`${magenta('Executing analyzer rules...')}`);

    for (const rule of rules) {
      await context.checkpoint('Running the rules', rules.indexOf(rule), rules.length, rule);

      logger.log(t`  ${`[${rules.indexOf(rule) + 1}/${rules.length}]`} ${bold(rule)}`);

      for (const resource of resources) {
        const result: IAnalyzerRuleResult =
          rule === 'unused-keys' && stopped
            ? { resource, success: false, message: stopped, data: [{ stopped }], severity: 'error' }
            : this.resultOf(inputs, rule, resource, () =>
                analyzer.executeRule(rule, {
                  resource,
                  resources,
                  parameters: {
                    usedKeys,
                    baseLocale: options.baseLocale,
                    identicalKeys: options.identicalKeys,
                    identicalValues: options.identicalValues,
                    severities: options.severities,
                    ruleExceptions: options.ruleExceptions,
                  },
                }),
              );

        logger.log(t`    ${symbol(result.success ? 'success' : 'error')} ${t`${result.message}`}`);
        logger.log(t`      ${t`Resource: ${resource.locale} (${resource.path})`}`);

        results.push(result);
        rows.push({
          rule,
          file: resource.path,
          locale: resource.locale,
          success: result.success,
          message: result.message,
          details: result.data,
        });

        if (!result.success) {
          findings.push({
            rule,
            severity: usesSeverities ? this.severityOf(result) : 'error',
            message: result.message,
            file: resource.path,
            locale: resource.locale,
            ...(this.wasStopped(result) ? {} : { count: foundItemsOf(result.data).length }),
          });
        }
      }
    }

    logger.log(t`${magenta(`Analyzer rules completed.${StringExtensions.newLine}`)}`);

    const gate: IAnalysisGate | null =
      usesSeverities || stopped !== null
        ? {
            errors: findings.filter(
              (finding) => finding.severity === 'error' && finding.rule !== VERIFICATION_RULE,
            ).length,
            warnings: findings.filter((finding) => finding.severity === 'warning').length,
            refusedPacks,
          }
        : null;

    return {
      result: results,
      data: { results: rows, ...(gate ? { gate } : {}) },
      findings,
      executedRules: rules,
    };
  }

  /**
   * Checks the configured languages independently of the rules selected for this run.
   *
   * @private
   */
  private requireExpectedLocales(
    expected: ReadonlyArray<string>,
    resources: ReadonlyArray<IResourceInfo>,
  ): void {
    if (expected.length === 0) {
      return;
    }

    const normalize = (locale: string): string => locale.replaceAll('_', '-').toLowerCase();
    const populated = new Set(
      resources
        .filter((resource) => resource.keys().length > 0)
        .map((resource) => normalize(resource.locale)),
    );
    const missing = new Map<string, string>();

    for (const locale of expected) {
      const normalized = normalize(locale);

      if (!populated.has(normalized) && !missing.has(normalized)) {
        missing.set(normalized, locale);
      }
    }

    if (missing.size > 0) {
      throw new EngineError(
        'invalid-configuration',
        `No non-empty catalog found for the expected locale(s) ${Array.from(missing.values()).join(', ')}. Check actions.analyze.expectedLocales and the catalog files under actions.detect.resourceRoot.`,
      );
    }
  }

  /**
   * Works out what the key of a cached result holds besides its rule: the content of every catalog, what the sources use, and
   * every setting and pack a rule can read.
   *
   * @private
   */
  private inputsOf(
    cache: ResultCache,
    options: IAnalyzeOptions,
    resources: ReadonlyArray<IResourceInfo>,
    packs: ILoadedPacks,
    usedKeys: ReadonlyArray<string>,
    context: IUseCaseContext,
  ): IAnalysisInputs {
    // What the rules read is what was parsed, so the hash comes from there: a file that changes meanwhile cannot get an old result.
    const catalogs = new Map(
      resources.map((resource) => [
        resource,
        {
          path: resolve(context.cwd, resource.path),
          hash: hashText(
            JSON.stringify([
              resource.locale,
              resource.keys(),
              resource.values(),
              resource.toString(),
            ]),
          ),
        },
      ]),
    );

    return {
      cache,
      catalogs,
      all: hashText(JSON.stringify(Array.from(catalogs.values()))),
      settings: {
        type: options.type,
        baseLocale: options.baseLocale,
        identicalKeys: options.identicalKeys,
        identicalValues: options.identicalValues,
        severities: options.severities ?? null,
        ruleExceptions: options.ruleExceptions ?? null,
        usedKeys,
        packs: packs.packs.map((pack) => ({
          id: pack.id,
          hash: pack.entry.hash,
          found: pack.foundHash,
          enabled: pack.enabled,
          refusal: pack.refusal,
        })),
        lock: packs.lock?.problem ?? null,
      },
    };
  }

  /**
   * Runs a rule on a catalog, unless the cache holds the result for exactly these inputs. A rule that a time limit stopped found
   * only part of the answer, and that stays out of the cache.
   *
   * @private
   */
  private resultOf(
    inputs: IAnalysisInputs | null,
    rule: string,
    resource: IResourceInfo,
    run: () => IAnalyzerRuleResult,
  ): IAnalyzerRuleResult {
    if (!inputs) {
      return run();
    }

    const own = inputs.catalogs.get(resource) as { path: string; hash: string };
    const key = {
      rule,
      file: own.path,
      content: own.hash,
      catalogs: SINGLE_CATALOG_RULES.has(rule) ? null : inputs.all,
      settings: inputs.settings,
    };
    const known = inputs.cache.read<Omit<IAnalyzerRuleResult, 'resource'>>('analyze.rule', key);

    if (known) {
      return { ...known, resource };
    }

    const result = run();

    if (!this.wasStopped(result)) {
      const { resource: _resource, ...value } = result;

      inputs.cache.write('analyze.rule', key, value);
    }

    return result;
  }

  /**
   * Returns what a result is worth. A rule that could not finish cannot vouch for anything, so it never passes as a warning.
   *
   * @private
   */
  private severityOf(result: IAnalyzerRuleResult): Finding['severity'] {
    return this.wasStopped(result) ? 'error' : (result.severity ?? 'error');
  }

  /**
   * @private
   */
  private wasStopped(result: IAnalyzerRuleResult): boolean {
    return (
      Array.isArray(result.data) &&
      (result.data as Array<{ stopped?: string }>).some((entry) => Boolean(entry.stopped))
    );
  }

  /**
   * @private
   */
  private refusalsOf(packs: ILoadedPacks): Array<{ pack: string; reason: string }> {
    return [
      ...(packs.lock?.problem
        ? [
            {
              pack: basename(packs.lock.path),
              reason: `This file cannot be read, so no pack of it runs: ${packs.lock.problem}`,
            },
          ]
        : []),
      ...packs.packs.flatMap((pack) =>
        pack.refusal ? [{ pack: pack.entry.name, reason: pack.refusal }] : [],
      ),
    ];
  }

  /**
   * Returns the rules to run. Rules this run asked for run as they are. Otherwise the configured rules or all built-in rules run,
   * next to the rules of the packs, without the ones that are off. Without sources every key would count as unused, so the default
   * then leaves out the `unused-keys` rule.
   *
   * @private
   */
  private resolveRules(
    options: IAnalyzeOptions,
    analyzer: ResourceAnalyzer,
    hasSources: boolean,
    packRules: ReadonlyArray<string>,
    packs: ILoadedPacks,
  ): Array<string> {
    if (options.explicitRules && options.rules.length > 0) {
      this.requireRunnable(options.rules, analyzer, packs);

      return options.rules;
    }

    const isOn = (rule: string): boolean => options.severities?.[rule] !== 'off';
    const builtIn = analyzer.ruleNames.filter((rule) => !packRules.includes(rule));
    const chosen =
      options.rules.length > 0
        ? options.rules
        : builtIn.filter((rule) => hasSources || rule !== 'unused-keys');

    return [...chosen, ...packRules.filter((rule) => !chosen.includes(rule))].filter(isOn);
  }

  /**
   * A rule of a refused pack cannot be asked for by name either, and the failure says why.
   *
   * @private
   */
  private requireRunnable(
    rules: ReadonlyArray<string>,
    analyzer: ResourceAnalyzer,
    packs: ILoadedPacks,
  ): void {
    for (const rule of rules.filter((candidate) => !analyzer.ruleNames.includes(candidate))) {
      const pack = packs.packs.find((candidate) => Object.hasOwn(candidate.entry.rules, rule));

      if (pack?.refusal) {
        throw new EngineError(
          'rule-pack-refused',
          `The rule '${rule}' belongs to the rule pack ${pack.entry.name}, which was refused: ${pack.refusal}`,
          packs.lock ? [packs.lock.path] : [],
        );
      }

      if (pack) {
        throw new EngineError(
          'invalid-arguments',
          `The rule '${rule}' belongs to the rule pack ${pack.entry.name}, which is turned off in this project.`,
        );
      }
    }
  }

  /**
   * Reads the source files of the preset below the root, except the resources themselves and test files.
   * Without a root or a preset there is nothing to read.
   *
   * @private
   */
  private async readSources(
    options: IAnalyzeOptions,
    context: IUseCaseContext,
  ): Promise<Array<string>> {
    if (!options.root || !options.preset) {
      return [];
    }

    const resourceRoots = ArrayExtensions.arrayify(options.resourceRoot)
      .filter((resourceRoot) => resourceRoot.length > 0)
      .map((resourceRoot) => Path.normalize(resourceRoot, true));
    const patterns = Presets.get(context.logger, options.preset)
      .getExtensions()
      .map((extension) => Path.combine(options.root, `**/*${extension}`));

    const files = context.fileSystem
      .fileGlob(patterns)
      .filter((file) => !isTestFile(file))
      .filter(
        (file) =>
          !resourceRoots.some((resourceRoot) =>
            Path.normalize(file).startsWith(`${resourceRoot}/`),
          ),
      );
    const sources = new Array<string>();

    for (const [index, file] of files.entries()) {
      await context.checkpoint('Reading the sources', index, files.length, null);
      sources.push(context.fileSystem.fileReadAllText(file));
    }

    return sources;
  }
}
