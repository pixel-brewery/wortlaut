// #region Imports

import { createContext, Script, type Context } from 'node:vm';

// #endregion

/**
 * How long one rule may look at one resource.
 */
const DEFAULT_CALL_MS = 250;

/**
 * How long all patterns of one analysis may take together, so many hostile rules add up to no more than this.
 */
const DEFAULT_TOTAL_MS = 2000;

/**
 * How much of a value a pattern reads.
 */
const MAX_INPUT_LENGTH = 16 * 1024;

/**
 * Tests all inputs in one go. The values come in as data and the pattern is built with `RegExp`: nothing of a pack is
 * ever compiled as a script.
 */
const TEST_SCRIPT = new Script(`(() => {
    const expression = new RegExp(source, flags);
    const matches = [];

    for (let index = 0; index < inputs.length; index++) {
        matches[index] = expression.test(inputs[index]);
    }

    return matches;
})()`);

/**
 * What became of a test: which inputs matched, or that it was stopped.
 *
 * @public
 */
export type PatternOutcome =
    | { kind: 'tested'; matches: Array<boolean> } |
    { kind: 'stopped'; reason: string };

/**
 * The bounds of a guard.
 *
 * @public
 */
export interface IPatternGuardOptions {
    callMs?: number;
    totalMs?: number;
}

/**
 * Runs regular expressions from outside with a bound on their time. A pattern can backtrack catastrophically, and no check of
 * its text finds every such pattern, so every test runs under a timeout that V8 enforces inside the match itself. A pattern
 * that hits it is not tried again, and all patterns of one analysis share a budget.
 *
 * @public
 */
export class PatternGuard {

    // #region Fields

    private readonly _callMs: number;
    private readonly _totalMs: number;
    private readonly _stopped: Set<string>;
    private _context: Context | null;
    private _spentMs: number;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `PatternGuard` class.
     *
     * @public
     * @param options The bounds.
     */
    public constructor(options: IPatternGuardOptions = {}) {
        this._callMs = options.callMs ?? DEFAULT_CALL_MS;
        this._totalMs = options.totalMs ?? DEFAULT_TOTAL_MS;
        this._stopped = new Set();
        this._context = null;
        this._spentMs = 0;
    }

    // #endregion

    // #region Methods

    /**
     * Returns why a pattern cannot be used. It compiles the pattern and runs nothing.
     *
     * @public
     * @param source The pattern.
     * @param flags Its flags.
     * @returns The reason, or `null` when it compiles.
     */
    public static findProblem(source: string, flags: string): string | null {
        try {
            void new RegExp(source, flags);

            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }

    /**
     * Tests a pattern against values, within the bounds of this guard.
     *
     * @public
     * @param source The pattern.
     * @param flags Its flags.
     * @param inputs The values.
     * @returns Which values matched, or why it was stopped.
     */
    public test(source: string, flags: string, inputs: ReadonlyArray<string>): PatternOutcome {
        const id = `${flags}/${source}`;

        if (this._stopped.has(id)) {
            return { kind: 'stopped', reason: 'It ran too long earlier in this analysis, so it was not tried again.' };
        }

        const remaining = this._totalMs - this._spentMs;

        if (remaining <= 0) {
            return { kind: 'stopped', reason: `The patterns of this analysis used up their ${this._totalMs} ms.` };
        }

        const timeout = Math.max(1, Math.ceil(Math.min(this._callMs, remaining)));
        const context = this._context ??= createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
        const startedAt = performance.now();

        context['source'] = source;
        context['flags'] = flags;
        context['inputs'] = inputs.map((input) => input.length > MAX_INPUT_LENGTH ? input.slice(0, MAX_INPUT_LENGTH) : input);

        try {
            return { kind: 'tested', matches: Array.from(TEST_SCRIPT.runInContext(context, { timeout }) as ArrayLike<boolean>) };
        } catch (error) {
            this._stopped.add(id);

            return (error as NodeJS.ErrnoException).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
                ? { kind: 'stopped', reason: `It ran longer than ${timeout} ms and was stopped.` }
                : { kind: 'stopped', reason: `It could not run: ${error instanceof Error ? error.message : String(error)}` };
        } finally {
            this._spentMs += performance.now() - startedAt;
            context['inputs'] = null;
        }
    }

    // #endregion

}
