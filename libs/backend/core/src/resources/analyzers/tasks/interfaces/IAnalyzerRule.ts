// #region Imports

import type { IResourceInfo } from '../../../models/interfaces/IResourceInfo';
import type { IRuleFinding, RuleSeverity } from '../../findings/RuleFinding';

// #endregion

/**
 * Represents the result of an analysis rule.
 *
 * @public
 * @template T The type of the result data.
 */
export interface IAnalyzerRuleResult<T = unknown> {
    resource: IResourceInfo;
    success: boolean;
    message: string;
    data: T;

    /**
     * What the rule is worth in this run. The analyzer fills it in.
     */
    severity?: Exclude<RuleSeverity, 'off'>;

    /**
     * What the rule found, in the one shape of a finding. The analyzer fills it in where a rule leaves it out.
     */
    findings?: Array<IRuleFinding>;

    /**
     * What a rule of a pack says about itself. A built-in rule leaves this to its surface.
     */
    presentation?: IRulePresentation;
}

/**
 * What a rule of a pack says about itself on a result card.
 *
 * @public
 */
export interface IRulePresentation {
    pack: string;
    title: string;
    column: string;
}

/**
 * Represents the context for executing an analyzer rule.
 *
 * @public
 */
export interface IAnalyzerRuleExecutionContext {
    resource: IResourceInfo;

    /**
     * All resources of the analysis, including `resource`. Rules that compare the locales of a catalog, such as
     * `key-consistency`, read the other locales from here; without it they only see `resource`.
     */
    resources?: ReadonlyArray<IResourceInfo>;
    parameters: Record<string, unknown>; // Generic key-value store for additional parameters.
}

/**
 * The interface for analyzer rules.
 *
 * @template TResult The type of the result data.
 */
export interface IAnalyzerRule<TResult = unknown> {

    // #region Properties

    /**
     * What the rule says it is worth. A built-in rule leaves this to the table of built-in severities.
     */
    readonly severity?: RuleSeverity;

    // #endregion

    // #region Methods

    /**
     * Executes the analysis rule.
     *
     * @param context The execution context.
     */
    execute(context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult<TResult>;

    // #endregion

}
