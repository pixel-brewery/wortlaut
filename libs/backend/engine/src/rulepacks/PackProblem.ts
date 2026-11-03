// #region Imports

import type { RulePackProblem } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Why a pack is refused, on its way from a source to a check. The check turns it into what the screen shows inline.
 *
 * @internal
 */
export class PackProblem extends Error {

    // #region Fields

    private readonly _kind: RulePackProblem['kind'];
    private readonly _details: ReadonlyArray<string>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `PackProblem` class.
     *
     * @param kind What kind of refusal it is.
     * @param message The reason, for the user.
     * @param details The definitions that are wrong, one line each.
     */
    public constructor(kind: RulePackProblem['kind'], message: string, details: ReadonlyArray<string> = []) {
        super(message);

        this.name = 'PackProblem';
        this._kind = kind;
        this._details = details;
    }

    // #endregion

    // #region Methods

    /**
     * Returns what the screen shows.
     *
     * @returns The problem.
     */
    public describe(): RulePackProblem {
        return { kind: this._kind, message: this.message, details: [...this._details] };
    }

    // #endregion

}
