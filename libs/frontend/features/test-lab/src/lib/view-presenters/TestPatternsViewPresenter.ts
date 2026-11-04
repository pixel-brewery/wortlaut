// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { TestPatternResult } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, AsyncValue, DesktopApi, formatCount, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The most pattern results added to the view at once.
 */
const PAGE_SIZE = 100;

/**
 * The list a pattern is tested for, whose grammar it follows.
 */
export type PatternList = 'usedKeys' | 'identicalKeys';

/**
 * The reference table of the syntax.
 */
const SYNTAX = [
    { token: 'loc.orders.title', text: 'The exact key.' },
    { token: '*', text: 'Any characters within one segment. At the end, the rest of the key.' },
    { token: '**', text: 'As a whole segment: any number of segments, none included.' },
    { token: '?', text: 'One character other than a dot.' },
    { token: '{a,b}', text: 'Either alternative. Braces expand first and may nest.' },
    { token: '*?', text: 'At the end: exactly one final segment.' },
    { token: '/expression/flags', text: 'A regular expression that must match the whole key.' }
];

/**
 * Owns Test lab: key patterns. It tests a pattern on the project's real keys, in the grammar of the list it would go into,
 * and nothing is written: the Add buttons only prepare a change in Analyze.
 */
@Injectable()
export class TestPatternsViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _router = inject(Router);
    private readonly _handoff = inject(AiHandoff);
    private readonly _model = signal({ pattern: '' });
    private readonly _list = signal<PatternList>('usedKeys');
    private readonly _proposal = signal<string | null>(null);
    private readonly _limit = signal(PAGE_SIZE);

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `TestPatternsViewPresenter` class.
     */
    public constructor() {
        const seed = this._handoff.takePattern();

        if (seed) {
            this._model.set({ pattern: seed.pattern });
            this._proposal.set(seed.note);
        }

        // The results update while typing.
        effect(() => {
            this._model();
            this._list();

            untracked(() => {
                this._limit.set(PAGE_SIZE);
                void this.result.reload();
            });
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets which keys the pattern covers.
     *
     * @readonly
     */
    public readonly result = new AsyncValue<TestPatternResult | null>(async () => {
        const project = this._shell.project();

        return project ? this._api.request('test.pattern', { projectId: project.id, pattern: this._model().pattern, list: this._list() }) : null;
    });

    /**
     * Gets the form of the pattern.
     *
     * @readonly
     */
    public readonly form = form(this._model);

    /**
     * Gets the list the pattern is tested for.
     *
     * @readonly
     */
    public readonly list = this._list.asReadonly();

    /**
     * Gets the reference table.
     *
     * @readonly
     */
    public readonly syntax = SYNTAX;

    /**
     * Gets the examples, in the grammar of the list and from the project's prefix.
     *
     * @readonly
     */
    public readonly examples = computed(() => {
        const key = this.result.value()?.keys[0]?.key ?? 'loc.orders.title';
        const segments = key.split('.');
        const head = segments.slice(0, Math.max(1, segments.length - 1)).join('.');

        return this._list() === 'usedKeys'
            ? [`${head}.*`, `${segments[0]}.**.${segments.at(-1)}`, `${head}.{${segments.at(-1)},other}`, `/${head.replace(/\./g, '\\.')}\\.\\w+/`]
            : [`${head}.*`, `${segments[0]}.*`];
    });

    /**
     * Gets the error of the pattern.
     *
     * @readonly
     */
    public readonly error = computed(() => this.result.value()?.error ?? null);

    /**
     * Gets the title of the results.
     *
     * @readonly
     */
    public readonly title = computed(() => {
        const result = this.result.value();

        return result ? `${formatCount(result.matchCount)} of ${formatCount(result.total)} keys match` : 'Keys';
    });

    /**
     * Gets the keys, marked as matching or not.
     *
     * @readonly
     */
    public readonly keys = computed(() => (this.result.value()?.keys ?? []).slice(0, this._limit()));

    /**
     * Gets whether more of the returned keys can be displayed.
     *
     * @public
     * @readonly
     */
    public readonly hasMoreKeys = computed(() => (this.result.value()?.keys.length ?? 0) > this._limit());

    /**
     * Gets how many keys do not show.
     *
     * @readonly
     */
    public readonly hiddenKeys = computed(() => {
        const result = this.result.value();

        return result ? result.total - this.keys().length : 0;
    });

    /**
     * Gets what is known about a pattern an AI proposed. It stays a proposal until the user adds it to a list.
     *
     * @readonly
     */
    public readonly proposal = this._proposal.asReadonly();

    /**
     * Gets whether the pattern can go into a list.
     *
     * @readonly
     */
    public readonly canAdd = computed(() => this._model().pattern.length > 0 && this.error() === null);

    // #endregion

    // #region Methods

    /**
     * Fills the field with an example.
     *
     * @param pattern The example.
     */
    public useExample(pattern: string): void {
        this._model.set({ pattern });
    }

    /**
     * Sets the list the pattern is tested for.
     *
     * @param list The list.
     */
    public setList(list: PatternList): void {
        this._list.set(list);
    }

    /**
     * Displays the next page while preserving the result's full match count.
     *
     * @public
     */
    public showMoreKeys(): void {
        this._limit.update((limit) => limit + PAGE_SIZE);
    }

    /**
     * Prepares the change in Analyze. Nothing is written here.
     *
     * @param list The list.
     * @returns When Analyze is open.
     */
    public async add(list: PatternList): Promise<void> {
        await this._router.navigate(['/analyze'], { queryParams: { prepare: list, pattern: this._model().pattern } });
    }

    // #endregion

}
