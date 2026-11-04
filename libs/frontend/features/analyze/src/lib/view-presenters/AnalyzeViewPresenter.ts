// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { AnalyzeOverview, AnalyzeRow, AnalyzeRuleResult, ExceptionListName, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, AsyncValue, bindShortcuts, CommandRun, countOf, DesktopApi, formatCount, localeList, localeName, RunCenter, ShellSession, summarizeRuleResult } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many rows of a rule show at first.
 */
const PAGE_SIZE = 100;

/**
 * The lists a pattern can be prepared for.
 */
const LIST_NAMES: Readonly<Record<ExceptionListName, string>> = {
    usedKeys: 'Used keys',
    identicalKeys: 'Identical keys',
    identicalValues: 'Identical values'
};

/**
 * What a row of a rule can do.
 */
export type RowAction = 'allow' | 'allow-for-rule' | 'declare-used' | 'delete' | 'merge' | 'open-file';

/**
 * What the result card of a rule says.
 */
export interface IRuleCard {
    title: string;
    message: string;
    columnA: string;
    columnB: string;
    actions: ReadonlyArray<{ id: RowAction; label: string }>;
    footer: string;
    hasAi: 'translate' | 'patterns' | null;
}

/**
 * Writes what the result card of a rule says.
 *
 * @param rule The result of the rule.
 * @param context What the project is about.
 * @returns The card.
 */
export function describeRule(rule: AnalyzeRuleResult, context: { baseLocale: string; sourceRoot: string | null }): IRuleCard {
    const shown = rule.rows.length;
    const base = localeName(context.baseLocale);

    if (rule.pack) {
        return rule.passed
            ? { title: rule.pack.title, message: rule.message, columnA: 'Locale', columnB: 'Result', actions: [{ id: 'open-file', label: 'Open file' }], footer: 'Nothing to do for this rule.', hasAi: null }
            : { title: rule.pack.title, message: `${rule.message} From the rule pack ${rule.pack.name}.`, columnA: rule.rows.every((row) => row.key === null) ? 'Locale' : 'Key', columnB: rule.pack.column, actions: [{ id: 'allow-for-rule', label: 'Allow' }], footer: `Showing ${formatCount(shown)} of ${countOf(rule.total, 'value')}.`, hasAi: null };
    }

    if (rule.passed) {
        const titles: Readonly<Record<string, string>> = {
            'duplicate-keys': 'No duplicate keys',
            'duplicate-values': 'No duplicate values',
            'empty-values': 'No empty values',
            'key-consistency': 'Locales are consistent',
            'missing-translations': 'No identical values',
            'multiple-key-usage': 'No repeated keys',
            'unused-keys': 'Every key is used'
        };

        return { title: titles[rule.id] ?? rule.id, message: rule.message, columnA: 'Locale', columnB: 'Result', actions: [{ id: 'open-file', label: 'Open file' }], footer: 'Nothing to do for this rule.', hasAi: null };
    }

    const showing = (noun: string): string => `Showing ${formatCount(shown)} of ${countOf(rule.total, noun)}.`;

    switch (rule.id) {
        case 'duplicate-values':
            return {
                title: 'Duplicate values',
                message: 'Different keys with the same text can be merged, unless the wording may differ in another language.',
                columnA: 'Value',
                columnB: 'Keys',
                actions: [{ id: 'merge', label: 'Merge keys' }],
                footer: `${showing('value')} Merging keeps the first key.`,
                hasAi: null
            };
        case 'missing-translations':
            return {
                title: `${countOf(rule.total, 'value')} ${rule.total === 1 ? 'is' : 'are'} identical to ${base}`,
                message: 'Translate them, or allow values that are the same in every language.',
                columnA: 'Key',
                columnB: `Value in ${localeList(rule.locales.flatMap((entry) => entry.locale ?? []))}`,
                actions: [{ id: 'allow', label: 'Allow' }],
                footer: 'Allow adds the value to Identical values, for every locale.',
                hasAi: 'translate'
            };
        case 'unused-keys':
            return {
                title: `${countOf(rule.total, 'key')} ${rule.total === 1 ? 'is' : 'are'} not used${context.sourceRoot ? ` in ${context.sourceRoot}` : ''}`,
                message: 'Test files and resource files do not count. Declare keys that other code composes at runtime.',
                columnA: 'Key',
                columnB: 'Locales',
                actions: [{ id: 'declare-used', label: 'Declare used' }, { id: 'delete', label: 'Delete' }],
                footer: showing('key'),
                hasAi: 'patterns'
            };
        case 'key-consistency':
            return { title: `${countOf(rule.total, 'key')} ${rule.total === 1 ? 'is' : 'are'} missing in a locale`, message: 'Every locale of a catalog should define the same keys.', columnA: 'Key', columnB: 'Lacking in', actions: [{ id: 'open-file', label: 'Open file' }], footer: showing('key'), hasAi: null };
        case 'empty-values':
            return { title: `${countOf(rule.total, 'key')} without a text`, message: 'An empty value shows nothing in the app.', columnA: 'Key', columnB: 'Empty in', actions: [{ id: 'open-file', label: 'Open file' }], footer: showing('key'), hasAi: null };
        default:
            return { title: rule.id, message: rule.message, columnA: 'Key', columnB: 'Locales', actions: [{ id: 'open-file', label: 'Open file' }], footer: showing('key'), hasAi: null };
    }
}

/**
 * Owns Analyze: the switches, the run and what its rows can do. The switches affect this run only; the exceptions go into
 * the project's configuration, as change sets.
 */
@Injectable()
export class AnalyzeViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _route = inject(ActivatedRoute);
    private readonly _router = inject(Router);
    private readonly _handoff = inject(AiHandoff);
    private readonly _switches = signal<Readonly<Record<string, boolean>>>({});
    private readonly _picked = signal<string | null>(null);
    private readonly _limit = signal(PAGE_SIZE);
    private readonly _outcome = signal<WriteOutcome | null>(null);
    private readonly _message = signal<string | null>(null);
    private readonly _busy = signal(false);
    private readonly _waiting = signal<ReadonlySet<string>>(new Set());
    private readonly _aiMessage = signal<string | null>(null);
    private readonly _aiBusy = signal(false);
    private readonly _prepared = signal<{ list: ExceptionListName; pattern: string } | null>(this.readPrepared());

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `AnalyzeViewPresenter` class.
     */
    public constructor() {
        bindShortcuts({
            run: () => this.canRun() ? this.analyze() : undefined,
            suggest: () => this.selected() && !this.selected()?.passed && !this.aiBusy() ? this.suggestPatterns() : undefined,
            next: () => {
                this.pickNextFinding();
            }
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the run of an analysis.
     *
     * @readonly
     */
    public readonly run = new CommandRun(inject(DesktopApi), inject(RunCenter), 'analyze');

    /**
     * Gets what the view shows before a run.
     *
     * @readonly
     */
    public readonly overview = new AsyncValue<AnalyzeOverview>(() => this._api.request('analyze.overview', { projectId: this.requireProject() }));

    /**
     * Gets the line below the title.
     *
     * @readonly
     */
    public readonly lead = computed(() => {
        const overview = this.overview.value();

        return overview ? { text: `Base locale ${localeName(overview.baseLocale)} · ${countOf(overview.locales.length, 'locale')}`, sourceRoot: overview.sourceRoot } : null;
    });

    /**
     * Gets the rules of the list: the current result when there is one, otherwise the last one.
     *
     * @readonly
     */
    public readonly rules = computed(() => {
        const overview = this.overview.value();
        const results = this.results();

        return (overview?.rules ?? []).map((rule) => {
            const isOn = this._switches()[rule.id] ?? rule.enabled;
            const current = results.find((result) => result.id === rule.id);
            const last = current ?? rule.last;
            const severity = current?.severity ?? rule.severity;
            const result = !isOn ? { label: 'Off', detail: 'Off' } : last ? summarizeRuleResult(last.locales, last.passed) : { label: 'Not run', detail: 'Not run' };

            return {
                id: rule.id,
                description: rule.description,
                group: rule.group,
                isOn,
                isSelected: rule.id === this.selectedId(),
                result: result.label,
                resultDetail: result.detail,
                variant: !isOn || !last ? 'neutral' as const : last.passed ? 'success' as const : severity === 'error' ? 'danger' as const : 'warning' as const
            };
        });
    });

    /**
     * Gets the group of the list.
     *
     * @readonly
     */
    public readonly groups = computed(() => {
        const rules = this.rules();

        return Array.from(new Set(rules.map((rule) => rule.group))).map((label) => ({ label, rules: rules.filter((rule) => rule.group === label) }));
    });

    /**
     * Gets the packs of the lock file that failed their verification, whose rules do not run.
     *
     * @readonly
     */
    public readonly refusedPacks = computed(() => this.overview.value()?.refusedPacks ?? []);

    /**
     * Gets the label of the button, whose count follows the switches.
     *
     * @readonly
     */
    public readonly runLabel = computed(() => `Run ${countOf(this.enabledRules().length, 'rule')}`);

    /**
     * Gets whether an analysis can start.
     *
     * @readonly
     */
    public readonly canRun = computed(() => this.enabledRules().length > 0 && !this.run.isRunning());

    /**
     * Gets the results of the analysis.
     *
     * @readonly
     */
    public readonly results = computed(() => this.run.output()?.rules ?? []);

    /**
     * Gets why an AI proposal failed.
     *
     * @readonly
     */
    public readonly aiMessage = this._aiMessage.asReadonly();

    /**
     * Gets whether an AI proposal is on its way.
     *
     * @readonly
     */
    public readonly aiBusy = this._aiBusy.asReadonly();

    /**
     * Gets the rule whose result shows: the one picked, or the first that failed.
     *
     * @readonly
     */
    public readonly selectedId = computed(() => this._picked() ?? this.results().find((result) => !result.passed)?.id ?? this.results()[0]?.id ?? null);

    /**
     * Gets the result of the selected rule.
     *
     * @readonly
     */
    public readonly selected = computed(() => this.results().find((result) => result.id === this.selectedId()) ?? null);

    /**
     * Gets what the result card says.
     *
     * @readonly
     */
    public readonly card = computed(() => {
        const rule = this.selected();
        const overview = this.overview.value();

        return rule && overview ? describeRule(rule, overview) : null;
    });

    /**
     * Gets the rows of the result card that show.
     *
     * @readonly
     */
    public readonly rows = computed(() => (this.selected()?.rows ?? []).slice(0, this._limit()).map((row) => ({
        ...row,
        isWaiting: this._waiting().has(this.rowId(row)),
        id: this.rowId(row)
    })));

    /**
     * Gets whether more rows of the rule can show.
     *
     * @readonly
     */
    public readonly hasMoreRows = computed(() => (this.selected()?.rows.length ?? 0) > this._limit());

    /**
     * Gets the groups of exceptions.
     *
     * @readonly
     */
    public readonly exceptions = computed(() => {
        const exceptions = this.overview.value()?.exceptions;

        return [
            { title: 'Used keys', about: 'Count as used, although no source mentions them.', items: exceptions?.usedKeys ?? [] },
            { title: 'Identical keys', about: 'May equal the base locale in every locale.', items: exceptions?.identicalKeys ?? [] },
            { title: 'Identical values', about: 'Need no translation in any locale.', items: exceptions?.identicalValues ?? [] }
        ];
    });

    /**
     * Gets what the test lab prepared, which only becomes a change set here.
     *
     * @readonly
     */
    public readonly prepared = computed(() => {
        const prepared = this._prepared();

        return prepared ? { ...prepared, listName: LIST_NAMES[prepared.list] } : null;
    });

    /**
     * Gets what the last action did.
     *
     * @readonly
     */
    public readonly outcome = this._outcome.asReadonly();

    /**
     * Gets why the last action failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets whether an action is going on.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    // #endregion

    // #region Methods

    /**
     * Shows the next rule with an open finding, and the first again after the last.
     */
    public pickNextFinding(): void {
        const failing = this.results().filter((result) => !result.passed);
        const next = failing[failing.findIndex((result) => result.id === this.selectedId()) + 1] ?? failing[0];

        if (next) {
            this.pick(next.id);
        }
    }

    /**
     * Loads the view, and finds an analysis that went on or ended before a reload.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await this.overview.reload();

        if (this.overview.value()) {
            await this.run.restore(this.requireProject());
        }
    }

    /**
     * Runs the rules that are on.
     *
     * @returns When the analysis ended.
     */
    public async analyze(): Promise<void> {
        this._message.set(null);
        this._outcome.set(null);
        this._waiting.set(new Set());
        await this.startRun();
    }

    /**
     * Turns a rule on or off for this run. Setting what is already set changes nothing, because a switch also reports the
     * state it was bound to.
     *
     * @param id The rule.
     * @param isOn The new state.
     */
    public setRule(id: string, isOn: boolean): void {
        if (this.rules().find((rule) => rule.id === id)?.isOn !== isOn) {
            this._switches.update((switches) => ({ ...switches, [id]: isOn }));
        }
    }

    /**
     * Shows the result of a rule.
     *
     * @param id The rule.
     */
    public pick(id: string): void {
        this._picked.set(id);
        this._limit.set(PAGE_SIZE);
    }

    /**
     * Shows more rows of the rule.
     */
    public showMore(): void {
        this._limit.update((limit) => limit + PAGE_SIZE);
    }

    /**
     * Goes to Generate with the keys of the open rule as its scope.
     *
     * @returns When it is open.
     */
    public async translateWithAi(): Promise<void> {
        this._handoff.offerGenerate({ keys: this.selectedKeys() });
        await this._router.navigate(['/generate']);
    }

    /**
     * Asks the AI for patterns that cover the keys of the open rule, and goes to the test lab with the widest one. It stays a
     * proposal there until the user adds it to a list.
     *
     * @returns When it is open.
     */
    public async suggestPatterns(): Promise<void> {
        this._aiBusy.set(true);
        this._aiMessage.set(null);

        try {
            const { patterns, providerName } = await this._api.request('ai.suggestPatterns', { requestId: crypto.randomUUID(), projectId: this.requireProject(), keys: this.selectedKeys().slice(0, 2000) });
            const [best] = patterns;

            if (!best) {
                this._aiMessage.set(`${providerName} proposed no pattern that covers these keys.`);

                return;
            }

            const others = patterns.slice(1).map((pattern) => pattern.pattern);

            this._handoff.offerPattern({
                pattern: best.pattern,
                note: `${providerName} proposed this pattern, which covers ${countOf(best.matchCount, 'key')} of this list.${others.length > 0 ? ` Others: ${others.join(', ')}` : ''}`
            });
            await this._router.navigate(['/test-lab/patterns']);
        } catch (error) {
            this._aiMessage.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._aiBusy.set(false);
        }
    }

    /**
     * Carries out the action of a row.
     *
     * @param action The action.
     * @param row The row.
     * @returns When it is done.
     */
    public async act(action: RowAction, row: AnalyzeRow): Promise<void> {
        const projectId = this.requireProject();

        switch (action) {
            case 'allow':
                await this.write(row, () => this._api.request('config.addException', { projectId, list: 'identicalValues', entry: row.value ?? '' }));
                break;
            case 'declare-used':
                await this.write(row, () => this._api.request('config.addException', { projectId, list: 'usedKeys', entry: row.key ?? '' }));
                break;
            case 'delete':
                await this.write(row, () => this._api.request('catalog.deleteKey', { projectId, key: row.key ?? '' }));
                break;
            case 'allow-for-rule':
                await this.write(row, () => this._api.request('config.addRuleException', { projectId, rule: this.selected()?.id ?? '', key: row.key ?? '' }));
                break;
            case 'merge':
                await this.write(row, () => this._api.request('catalog.mergeKeys', { projectId, keep: row.keys[0], remove: row.keys.slice(1) }));
                break;
            default:
                await this.openFile(row);
        }
    }

    /**
     * Adds what the test lab prepared to its list, as a change set.
     *
     * @returns When it is done.
     */
    public async applyPrepared(): Promise<void> {
        const prepared = this._prepared();

        if (prepared) {
            await this.writeOutcome(() => this._api.request('config.addException', { projectId: this.requireProject(), list: prepared.list, entry: prepared.pattern }));
            this._prepared.set(null);
        }
    }

    /**
     * Leaves what the test lab prepared.
     */
    public dismissPrepared(): void {
        this._prepared.set(null);
    }

    /**
     * @private
     */
    private enabledRules(): Array<string> {
        return this.rules().filter((rule) => rule.isOn)
            .map((rule) => rule.id);
    }

    /**
     * @private
     */
    private async startRun(): Promise<void> {
        await this.run.start({ command: 'analyze', projectId: this.requireProject(), input: { rules: this.enabledRules() } });
        await this.overview.reload();
    }

    /**
     * @private
     */
    private async write(row: AnalyzeRow, request: () => Promise<WriteOutcome>): Promise<void> {
        const outcome = await this.writeOutcome(request);

        if (outcome?.state === 'pending') {
            this._waiting.update((waiting) => new Set([...waiting, this.rowId(row)]));
        }
    }

    /**
     * Writes through a change set. Once it reached the repository the result is stale, so the analysis runs again.
     *
     * @private
     */
    private async writeOutcome(request: () => Promise<WriteOutcome>): Promise<WriteOutcome | null> {
        this._busy.set(true);
        this._message.set(null);

        try {
            const outcome = await request();

            this._outcome.set(outcome);

            if (outcome.state === 'applied') {
                if (this.run.output()) {
                    await this.startRun();
                } else {
                    await this.overview.reload();
                }
            }

            return outcome;
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));

            return null;
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * @private
     */
    private async openFile(row: AnalyzeRow): Promise<void> {
        this._message.set(null);

        try {
            await this._api.request('catalog.openFile', { projectId: this.requireProject(), locale: row.locale ?? this.overview.value()?.baseLocale ?? '' });
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * @private
     */
    private rowId(row: AnalyzeRow): string {
        return `${row.a}\n${row.b}`;
    }

    /**
     * Reads what the test lab prepared from the route.
     *
     * @private
     */
    private readPrepared(): { list: ExceptionListName; pattern: string } | null {
        const parameters = this._route.snapshot.queryParamMap;
        const list = parameters.get('prepare');
        const pattern = parameters.get('pattern');

        return pattern && (list === 'usedKeys' || list === 'identicalKeys') ? { list, pattern } : null;
    }

    /**
     * @private
     */
    private selectedKeys(): Array<string> {
        return Array.from(new Set((this.selected()?.rows ?? []).flatMap((row) => row.keys)));
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
