// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import type { LocaleCoverage, NextStep, ProjectSummary, RuleResult, RunSummary } from '@pixel-brewery/wortlaut-contracts';
import type { IFigure, ILocaleRow, INextStepCard, IRuleRow } from '../contracts/IOverviewModels';
import { AsyncValue, countOf, DesktopApi, formatCount, formatInstant, formatName, localeList, localeName, presetName, ShellSession, summarizeRuleResult } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * Writes what a next step says.
 *
 * @param step The step from the engine.
 * @returns What the card shows.
 */
export function describeNextStep(step: NextStep): INextStepCard {
    switch (step.kind) {
        case 'identical-values':
            return {
                title: `Review ${countOf(step.count, 'identical value')}`,
                text: 'Translate them, or allow them where the word is the same in both languages.',
                action: 'Open findings',
                route: '/analyze'
            };
        case 'unused-keys':
            return {
                title: `Clean up ${countOf(step.count, 'unused key')}`,
                text: 'Delete them, or declare the keys that other code composes at runtime.',
                action: 'Test patterns',
                route: '/test-lab/patterns'
            };
        default:
            return {
                title: `Add ${localeName(step.locale)}`,
                text: `${countOf(step.keys, 'key')} in ${countOf(step.chunks, 'chunk')} with the current settings. You review before anything is written.`,
                action: 'Set up translation',
                route: '/generate'
            };
    }
}

/**
 * Writes a row of the locale coverage.
 *
 * @param locale The coverage from the engine.
 * @returns The row.
 */
export function describeLocale(locale: LocaleCoverage): ILocaleRow {
    const base = { code: locale.code, name: localeName(locale.code), file: locale.file ?? 'Not created', total: locale.total };

    if (locale.isBase) {
        return { ...base, done: locale.total, count: 'Base', state: 'Base locale', variant: 'neutral' };
    }

    const count = `${formatCount(locale.translated)} of ${formatCount(locale.total)}`;

    if (locale.file === null) {
        return { ...base, done: 0, count, state: 'Not started', variant: 'neutral' };
    }

    if (locale.missing > 0) {
        return { ...base, done: locale.translated, count, state: `${formatCount(locale.missing)} missing`, variant: 'warning' };
    }

    return locale.identical > 0
        ? { ...base, done: locale.translated, count, state: `${formatCount(locale.identical)} identical`, variant: 'warning' }
        : { ...base, done: locale.translated, count, state: 'Complete', variant: 'success' };
}

/**
 * Writes the result of a rule.
 *
 * @param rule The rule from the engine.
 * @returns The row.
 */
export function describeRule(rule: RuleResult): IRuleRow {
    const result = summarizeRuleResult(rule.locales, rule.passed);

    return { id: rule.id, passed: rule.passed, result: result.label, detail: result.detail, resultLocale: result.locale };
}

/**
 * Owns Overview. It reads the catalogs and the last analysis, and it starts nothing: Run analysis and Translate with AI
 * are links.
 */
@Injectable()
export class OverviewViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _now = signal(new Date());

    // #endregion

    // #region Properties

    /**
     * Gets the summary of the open project.
     *
     * @readonly
     */
    public readonly summary = new AsyncValue<ProjectSummary>(() => this._api.request('project.summary', { projectId: this.requireProject() }));

    /**
     * Gets the last runs of the open project.
     *
     * @readonly
     */
    public readonly runs = new AsyncValue<Array<RunSummary>>(() => this._api.request('run.list', { projectId: this.requireProject(), limit: 3 }));

    /**
     * Gets the line below the title.
     *
     * @readonly
     */
    public readonly subtitle = computed(() => {
        const summary = this.summary.value();

        return summary ? { name: summary.name, root: summary.resourceRoot, rest: `${formatName(summary.format)} · ${presetName(summary.preset)}` } : null;
    });

    /**
     * Gets the key figures. Before the first analysis the rule figures say so.
     *
     * @readonly
     */
    public readonly figures = computed<Array<IFigure>>(() => {
        const summary = this.summary.value();

        if (!summary) {
            return [];
        }

        const analysis = summary.analysis;
        const targets = summary.locales.filter((locale) => !locale.isBase && locale.file !== null);
        const failing = analysis?.rules
            .filter((rule) => !rule.passed)
            .map((rule) => rule.id)
            .join(', ');

        return [
            { label: 'Keys', value: formatCount(summary.keyCount), note: `${countOf(summary.namespaceCount, 'namespace')} in ${countOf(summary.catalogCount, 'catalog')}` },
            {
                label: 'Translated',
                value: summary.translatedShare === null ? '–' : `${(summary.translatedShare * 100).toFixed(1)}%`,
                note: targets.length === 0
                    ? 'No target locale has a catalog yet'
                    : `${formatCount(summary.translatedCount)} ${localeList(targets.map((locale) => locale.code))} values differ from ${localeName(summary.baseLocale)}`
            },
            {
                label: 'Failing rules',
                value: analysis ? `${analysis.failingRules} of ${analysis.rules.length}` : 'Not analyzed',
                note: analysis ? failing || 'Every rule passes' : 'Run an analysis to see the results'
            },
            {
                label: 'Unused keys',
                value: analysis?.unusedKeys === null || !analysis ? 'Not analyzed' : formatCount(analysis.unusedKeys),
                note: !analysis || analysis.unusedKeys === null
                    ? 'Needs an analysis with a source root'
                    : analysis.unusedKeys > 0 && summary.sourceRoot ? `No source below ${summary.sourceRoot} uses them` : 'Every key is used'
            }
        ];
    });

    /**
     * Gets the next steps. None open: the section hides.
     *
     * @readonly
     */
    public readonly nextSteps = computed(() => (this.summary.value()?.nextSteps ?? []).map((step) => describeNextStep(step)));

    /**
     * Gets the rows of the locale coverage.
     *
     * @readonly
     */
    public readonly locales = computed(() => (this.summary.value()?.locales ?? []).map((locale) => describeLocale(locale)));

    /**
     * Gets the bars of the keys by namespace, largest first, then what the rest holds together.
     *
     * @readonly
     */
    public readonly namespaces = computed(() => {
        const summary = this.summary.value();
        const all = [...summary?.namespaces ?? [], ...summary?.moreNamespaces ? [summary.moreNamespaces] : []];
        const largest = Math.max(1, ...all.map((namespace) => namespace.count));

        return all.map((namespace) => ({ ...namespace, label: formatCount(namespace.count), width: `${Math.round((namespace.count / largest) * 100)}%` }));
    });

    /**
     * Gets the rules of the last analysis.
     *
     * @readonly
     */
    public readonly rules = computed(() => (this.summary.value()?.analysis?.rules ?? []).map((rule) => describeRule(rule)));

    /**
     * Gets the header note of the rules card.
     *
     * @readonly
     */
    public readonly rulesNote = computed(() => {
        const analysis = this.summary.value()?.analysis;

        return analysis ? `${analysis.rules.length - analysis.failingRules} of ${analysis.rules.length} pass` : 'Not analyzed';
    });

    // #endregion

    // #region Methods

    /**
     * Loads the view.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        this._now.set(new Date());
        await Promise.all([this.summary.reload(), this.runs.reload()]);
    }

    /**
     * Writes when and how a run happened.
     *
     * @param run The run.
     * @returns For example `Dry run · 2 min ago`.
     */
    public whenOf(run: RunSummary): string {
        return [run.dryRun ? 'Dry run' : run.forReview ? 'For review' : null, formatInstant(run.startedAt, this._now())].filter((part) => part !== null).join(' · ');
    }

    /**
     * @private
     */
    private requireProject(): string {
        const project = this._shell.project();

        if (!project) {
            throw new Error('No project is open.');
        }

        return project.id;
    }

    // #endregion

}
