// #region Imports

import { Injectable } from '@angular/core';
import type { AiProvider, GenerateInput } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * What a screen hands to Generate: a setup, or the keys of a finding.
 */
export interface IGenerateSeed {
    input?: GenerateInput;
    keys?: ReadonlyArray<string>;
}

/**
 * What the test lab starts from when Generate sends a user there.
 */
export interface ITestTranslationSeed {
    input: GenerateInput;
    size: number;
}

/**
 * A pattern an AI proposed, on its way to the test lab.
 */
export interface IPatternSeed {
    pattern: string;
    note: string;
}

/**
 * Carries a choice from one screen to the next without a feature knowing another. It holds proposals and setups: it holds no
 * key, and nothing here reaches a repository.
 */
@Injectable({ providedIn: 'root' })
export class AiHandoff {

    // #region Fields

    private _generate: IGenerateSeed | null = null;
    private _test: ITestTranslationSeed | null = null;
    private _pattern: IPatternSeed | null = null;

    // #endregion

    // #region Methods

    /**
     * Hands something to Generate.
     *
     * @param seed What it starts from.
     */
    public offerGenerate(seed: IGenerateSeed): void {
        this._generate = seed;
    }

    /**
     * Takes what was handed to Generate.
     *
     * @returns What it starts from, once.
     */
    public takeGenerate(): IGenerateSeed | null {
        const seed = this._generate;

        this._generate = null;

        return seed;
    }

    /**
     * Hands a setup to the test lab.
     *
     * @param seed What it starts from.
     */
    public offerTest(seed: ITestTranslationSeed): void {
        this._test = seed;
    }

    /**
     * Takes what was handed to the test lab.
     *
     * @returns What it starts from, once.
     */
    public takeTest(): ITestTranslationSeed | null {
        const seed = this._test;

        this._test = null;

        return seed;
    }

    /**
     * Hands a proposed pattern to the test lab.
     *
     * @param seed The pattern.
     */
    public offerPattern(seed: IPatternSeed): void {
        this._pattern = seed;
    }

    /**
     * Takes the proposed pattern.
     *
     * @returns The pattern, once.
     */
    public takePattern(): IPatternSeed | null {
        const seed = this._pattern;

        this._pattern = null;

        return seed;
    }

    // #endregion

}

/**
 * Says in a few words where a provider stands.
 *
 * @param provider The provider.
 * @returns For example `Local login, no API key`.
 */
export function describeProviderState(provider: Pick<AiProvider, 'kind' | 'state'>): string {
    switch (provider.state) {
        case 'ready':
            return provider.kind === 'local' ? 'Local login, no API key' : 'API key saved';
        case 'not-installed':
            return 'Not installed';
        case 'signed-out':
            return 'Not signed in';
        case 'no-key':
            return 'No API key';
        default:
            return 'Login could not be checked';
    }
}

/**
 * Writes an estimate of tokens. It says that it is one.
 *
 * @param tokens The tokens.
 * @returns For example `≈ 11 k`.
 */
export function formatTokens(tokens: number): string {
    return tokens >= 1000 ? `≈ ${Math.round(tokens / 1000)} k` : `≈ ${tokens}`;
}

/**
 * Writes an estimate that counts only part of what a provider uses. It says that, and it says nothing more exact than it knows.
 *
 * @public
 * @param tokens The tokens that can be counted.
 * @returns The text.
 */
export function formatTokensAtLeast(tokens: number): string {
    return tokens >= 1000 ? `More than ${Math.round(tokens / 1000)} k` : `More than ${tokens}`;
}
