// #region Imports

import { basename } from 'node:path';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { PresetSchema, type LocaleCoverage, type NamespaceCount, type NextStep, type ProjectSummary, type RuleResult, type RunRecord } from '@pixel-brewery/wortlaut-contracts';
import { findCatalogLocale, MissingTranslationsRule, ResourceAnalyzer, ResourceReader, type IMissingTranslationsRuleResultData, type IResourceInfo, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import type { IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { RunProjection } from '../runs/RunProjection.js';
import { countNamespaces } from './Namespaces.js';

// #endregion

/**
 * The most namespaces listed before "N more".
 */
const MAX_LISTED_NAMESPACES = 8;

/**
 * The most next steps a project shows.
 */
const MAX_NEXT_STEPS = 3;

/**
 * Reads the rules of an analysis from its record.
 *
 * @internal
 * @param run The run of the analysis.
 * @returns What Overview and Analyze show about it.
 */
export function describeAnalysis(run: RunRecord): NonNullable<ProjectSummary['analysis']> {
    const failed = RunProjection.failedRules(run);
    const configured = Array.isArray(run.options.rules) ? run.options.rules as Array<string> : [];
    const hasSources = Boolean(run.options.root && run.options.preset);
    const all = new ResourceAnalyzer(QUIET_LOGGER).ruleNames.filter((rule) => hasSources || rule !== 'unused-keys');
    const ruleIds = Array.from(new Set([...run.executedRules ?? (configured.length > 0 ? configured : all), ...failed]));
    const rules: Array<RuleResult> = ruleIds.map((id) => {
        const findings = run.findings.filter((finding) => finding.rule === id);

        return {
            id,
            passed: findings.length === 0,
            locales: findings.map((finding) => ({ locale: finding.locale, count: finding.count ?? null }))
        };
    });
    const unused = run.findings.filter((finding) => finding.rule === 'unused-keys');

    return {
        runId: run.id,
        finishedAt: run.finishedAt,
        rules,
        failingRules: failed.length,
        unusedKeys: ruleIds.includes('unused-keys') ? unused.reduce((most, finding) => Math.max(most, finding.count ?? 0), 0) : null
    };
}

/**
 * What a project needs to be summed up.
 *
 * @internal
 */
export interface IProjectSummaryInput {
    name: string;
    folder: string;
    configuration: IResolvedConfiguration;

    /**
     * The last successful analysis of this project.
     */
    lastAnalysis: RunRecord | null;
}

/**
 * Sums up a project from its catalogs and its last analysis. It only reads, and it runs no rule on its own except the one
 * that says which values count as translated, so a figure means the same as in `analyze`.
 *
 * @internal
 */
export class ProjectSummaryBuilder {

    // #region Fields

    private readonly _reader: ResourceReader;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProjectSummaryBuilder` class.
     *
     * @param fileSystem The file system.
     */
    public constructor(fileSystem: IFileSystem) {
        this._reader = new ResourceReader(QUIET_LOGGER, fileSystem);
    }

    // #endregion

    // #region Methods

    /**
     * Builds the summary.
     *
     * @param input The project.
     * @returns The summary.
     * @throws Error when a configured resource root cannot be read.
     */
    public build(input: IProjectSummaryInput): ProjectSummary {
        const { configuration, lastAnalysis } = input;
        const actions = configuration.options.actions;
        const format = (actions?.detect?.type ?? 'json') as ResourceMode;
        const roots = configuration.resourceRoots.filter((root) => root.length > 0);
        const resources = roots.length > 0 ? this._reader.scanDirectory(roots, format) : [];
        const baseLocale = actions?.analyze?.baseLocale ?? 'en';
        const locales = this.collectLocaleCoverage(input, resources, baseLocale);
        const keys = new Set(resources.flatMap((resource) => resource.keys()));
        const namespaces = countNamespaces(Array.from(keys), actions?.detect?.resourceKey?.prefix ?? '');
        const targets = locales.filter((locale) => !locale.isBase && locale.file !== null);
        const translatable = targets.reduce((sum, locale) => sum + locale.total, 0);
        const translated = targets.reduce((sum, locale) => sum + locale.translated, 0);
        const analysis = lastAnalysis ? describeAnalysis(lastAnalysis) : null;
        const preset = PresetSchema.safeParse(actions?.detect?.preset);

        return {
            name: input.name,
            resourceRoot: roots.length > 0 ? DisplayPath.relativeTo(input.folder, roots[0]) : null,
            format,
            preset: preset.success ? preset.data : null,
            hasCatalogs: resources.length > 0,
            sourceRoot: configuration.root ? DisplayPath.relativeTo(input.folder, configuration.root) : null,
            baseLocale,
            keyCount: keys.size,
            catalogCount: new Set(resources.map((resource) => basename(resource.path).replace(`.${resource.locale}.`, '.'))).size,
            namespaceCount: namespaces.length,
            translatedShare: translatable > 0 ? translated / translatable : null,
            translatedCount: translated,
            translatableCount: translatable,
            analysis,
            nextSteps: this.collectNextSteps(locales, analysis?.unusedKeys ?? null, actions?.generate?.chunkSize ?? 10),
            locales,
            namespaces: namespaces.slice(0, MAX_LISTED_NAMESPACES),
            moreNamespaces: this.summarizeRest(namespaces)
        };
    }

    /**
     * @private
     */
    private collectLocaleCoverage(input: IProjectSummaryInput, resources: ReadonlyArray<IResourceInfo>, baseLocale: string): Array<LocaleCoverage> {
        const actions = input.configuration.options.actions;
        const declared = [...actions?.detect?.languages ?? [], ...actions?.generate?.locales ?? []];
        const found = resources.map((resource) => resource.locale);
        const others = Array.from(new Set([...found, ...declared])).filter((locale) => locale !== baseLocale)
            .sort((a, b) => a.localeCompare(b));
        const baseResources = resources.filter((resource) => resource.locale === baseLocale);
        const total = baseResources.reduce((sum, resource) => sum + resource.keys().length, 0);
        const fileOf = (locale: string): string | null => {
            const files = resources.filter((resource) => resource.locale === locale).map((resource) => basename(resource.path));

            return files.length === 0 ? null : files.length === 1 ? files[0] : `${files[0]} and ${files.length - 1} more`;
        };
        const base: LocaleCoverage = { code: baseLocale, isBase: true, file: fileOf(baseLocale), total, translated: total, identical: 0, missing: 0 };

        return [
            base,
            ...others.map((code) => {
                const counts = this.countLocale(code, baseResources, resources, input);

                return { code, isBase: false, file: fileOf(code), total, translated: Math.max(0, total - counts.missing - counts.identical), ...counts };
            })
        ];
    }

    /**
     * @private
     */
    private countLocale(locale: string, baseResources: ReadonlyArray<IResourceInfo>, resources: ReadonlyArray<IResourceInfo>, input: IProjectSummaryInput): { identical: number; missing: number } {
        const analyze = input.configuration.options.actions?.analyze;
        const rule = new MissingTranslationsRule();
        let identical = 0;
        let missing = 0;

        for (const base of baseResources) {
            const resource = findCatalogLocale(base, resources, locale);

            if (!resource) {
                missing += base.keys().length;
                continue;
            }

            const values = new Map(resource.entries());
            const data = rule.execute({
                resource,
                resources: [...resources],
                parameters: { baseLocale: base.locale, identicalKeys: analyze?.identicalKeys, identicalValues: analyze?.identicalValues }
            }).data as Array<IMissingTranslationsRuleResultData>;

            missing += base.keys().filter((key) => !values.get(key)).length;
            identical += data.reduce((sum, entry) => sum + entry.untranslatedKeys.length, 0);
        }

        return { identical, missing };
    }

    /**
     * @private
     */
    private summarizeRest(namespaces: ReadonlyArray<NamespaceCount>): NamespaceCount | null {
        const rest = namespaces.slice(MAX_LISTED_NAMESPACES);

        return rest.length === 0 ? null : { name: `${rest.length} more`, count: rest.reduce((sum, namespace) => sum + namespace.count, 0) };
    }

    /**
     * @private
     */
    private collectNextSteps(locales: ReadonlyArray<LocaleCoverage>, unusedKeys: number | null, chunkSize: number): Array<NextStep> {
        const steps = new Array<NextStep>();
        const identical = locales.reduce((sum, locale) => sum + locale.identical, 0);
        const notCreated = locales.find((locale) => !locale.isBase && locale.file === null);

        if (identical > 0) {
            steps.push({ kind: 'identical-values', count: identical });
        }

        if (unusedKeys) {
            steps.push({ kind: 'unused-keys', count: unusedKeys });
        }

        if (notCreated) {
            steps.push({ kind: 'missing-locale', locale: notCreated.code, keys: notCreated.total, chunks: Math.ceil(notCreated.total / Math.max(1, chunkSize)) });
        }

        return steps.slice(0, MAX_NEXT_STEPS);
    }

    // #endregion

}
