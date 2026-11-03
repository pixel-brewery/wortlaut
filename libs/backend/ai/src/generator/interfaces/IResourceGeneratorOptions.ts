// #region Imports

import type { IResourceGeneratorStrategyConfig } from '../strategies/interfaces/IResourceGeneratorStrategyConfig.js';
import type { IResourceGeneratorProgress } from './IResourceGeneratorResult.js';

// #endregion

/**
 * How the generator selects the keys to translate: `all` of them, only the `new` ones the target lacks, or the `missing`
 * ones, which the target lacks or holds identical to the base locale.
 *
 * @public
 */
export type ResourceGeneratorKeyScope = 'all' | 'new' | 'missing';

/**
 * Represents the `IResourceGeneratorOptions` interface.
 *
 * @public
 */
export interface IResourceGeneratorOptions {

    // #region Properties

    /**
     * The configuration for the resource generator strategy.
     */
    config: IResourceGeneratorStrategyConfig;

    /**
     * The chunk size for the generator.
     * It will be used to split the resources into smaller chunks.
     */
    chunkSize: number;

    /**
     * The maximum number of resources to generate.
     */
    limit: number | null;

    /**
     * Which keys to translate. The `onlyNew` argument of `run` selects `new` as well.
     *
     * @default 'all'
     */
    scope?: ResourceGeneratorKeyScope;

    /**
     * Translates only the keys below this namespace, for example `loc.orders`. The target keeps its other keys.
     */
    namespace?: string;

    /**
     * Translates only these keys.
     */
    keys?: ReadonlyArray<string>;

    /**
     * Patterns of keys whose value may stay identical to the base locale, for the `missing` scope.
     */
    identicalKeys?: Array<string>;

    /**
     * Values that may stay identical to the base locale, for the `missing` scope.
     */
    identicalValues?: Array<string>;

    /**
     * Instructions for one locale, on top of those for all locales.
     */
    localeInstructions?: Readonly<Record<string, string>>;

    /**
     * The comments of a format that keeps them apart from its catalog: they reach the prompt as data.
     */
    commentOf?: (key: string) => string;

    /**
     * How many times a chunk may be asked again.
     *
     * @default 2
     */
    retryBudget?: number;

    /**
     * The first wait before a chunk is asked again.
     */
    retryDelayMs?: number;

    /**
     * Receives the raw answers of the model.
     */
    onRaw?: (text: string) => void;

    /**
     * Writes the raw models of a locale into a temporary file, to analyze a wrong serialization.
     *
     * @default false
     */
    dumpModels?: boolean;

    /**
     * Stops the run: no new chunk starts, and a chunk in flight is cancelled.
     */
    signal?: AbortSignal;

    /**
     * Called when a locale starts and after every finished chunk. The generator shows no progress itself: stdout belongs
     * to the surface.
     */
    onProgress?: (progress: IResourceGeneratorProgress) => void;

    // #endregion

}
