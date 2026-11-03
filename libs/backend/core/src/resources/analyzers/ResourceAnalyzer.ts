// #region Imports

import { bold, type ILogger, magenta, symbol, t } from '@pixel-brewery/utilities';
import { EventEmitter } from 'node:stream';
import { createRuleFindings, severityOfRule, type RuleSeverity } from './findings/RuleFinding';
import { DuplicateKeysRule } from './tasks/DuplicateKeysRule';
import { DuplicateValuesRule } from './tasks/DuplicateValuesRule';
import { EmptyValuesRule } from './tasks/EmptyValuesRule';
import type { IAnalyzerRule, IAnalyzerRuleExecutionContext, IAnalyzerRuleResult } from './tasks/interfaces/IAnalyzerRule';
import { KeyConsistencyRule } from './tasks/KeyConsistencyRule';
import { MissingTranslationsRule } from './tasks/MissingTranslationsRule';
import { MultipleKeyUsageRule } from './tasks/MultipleKeyUsageRule';
import { UnusedKeysRule } from './tasks/UnusedKeysRule';

// #endregion

/**
 * Represents the event map for file system events.
 *
 * @public
 */
export interface IResourceAnalyzerEventMap {
    ruleExecuted: [ruleName: string, result: IAnalyzerRuleResult];
}

/**
 * The `ResourceAnalyzer` class, responsible for managing and executing analyzer rules.
 *
 * @public
 */
export class ResourceAnalyzer extends EventEmitter {

    // #region Fields

    private readonly _logger: ILogger;
    private readonly _rules: Map<string, IAnalyzerRule>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ResourceAnalyzer` class.
     *
     * @public
     */
    public constructor(logger: ILogger) {
        super();

        this._logger = logger;
        this._rules = new Map();

        // pre-defined rules
        this.registerRule('duplicate-keys', new DuplicateKeysRule());
        this.registerRule('duplicate-values', new DuplicateValuesRule());
        this.registerRule('empty-values', new EmptyValuesRule());
        this.registerRule('key-consistency', new KeyConsistencyRule());
        this.registerRule('missing-translations', new MissingTranslationsRule());
        this.registerRule('unused-keys', new UnusedKeysRule());
        this.registerRule('multiple-key-usage', new MultipleKeyUsageRule());
    }

    // #endregion

    // #region Properties

    /**
     * Gets the names of the registered rules.
     *
     * @public
     * @readonly
     */
    public get ruleNames(): Array<string> {
        return Array.from(this._rules.keys());
    }

    // #endregion

    // #region Methods

    /**
     * Registers a rule.
     *
     * @param name The name of the rule.
     * @param rule The rule instance.
     * @throws Error if the rule name is already registered.
     */
    public registerRule(name: string, rule: IAnalyzerRule): void {
        if (this._rules.has(name)) {
            throw new Error(`Rule '${name}' is already registered.`);
        }

        this._rules.set(name, rule);
    }

    /**
     * Unregister an analyzer rule.
     *
     * @param name The name of the rule to unregister.
     * @returns `true` if the rule was successfully unregistered; otherwise, `false`.
     */
    public unregisterRule(name: string): boolean {
        return this._rules.delete(name);
    }

    /**
     * Executes the specified analyzer rule.
     *
     * @public
     * @param name The name of the rule to execute.
     * @param context The execution context containing resources and additional parameters.
     * @returns The result of the rule execution.
     * @throws Error if the rule is not registered.
     */
    public executeRule(name: string, context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult {
        const rule = this._rules.get(name);

        if (!rule) {
            throw new Error(`Rule ${bold(name)} is not registered.`);
        }

        const result = this.describe(name, rule, context);
        this.emit('ruleExecuted', name, result);

        return result;
    }

    /**
     * Executes all registered rules.
     *
     * @public
     * @param context The execution context containing resources and additional parameters.
     * @returns An array of rule results.
     */
    public executeAllRules(context: IAnalyzerRuleExecutionContext): Array<IAnalyzerRuleResult> {
        this._logger.log(t`  ${'Executing all rules...'}`);

        const results: Array<IAnalyzerRuleResult> = [];

        for (const [name, rule] of this._rules) {
            const result = this.describe(name, rule, context);
            this.emit('ruleExecuted', name, result);

            if (result.success) {
                this._logger.log(t`    ${symbol('success')} ${bold(name)} completed.`);
                this._logger.log(t`      ${result.message}`);
            } else {
                this._logger.log(t`    ${symbol('error')} ${bold(name)} failed.`);
                this._logger.log(t`      ${result.message}`);
            }

            results.push(result);
        }

        this._logger.log(t`  ${magenta('All rules completed.')}`);

        return results;
    }

    /**
     * Lists all registered rules.
     *
     * @public
     * @returns An array of registered rule names.
     */
    public listRules(): Array<string> {
        return Array.from(this._rules.keys());
    }

    /**
     * Runs a rule and adds what every result has in common: its severity and its findings in the one shape, so built-in
     * rules and rules of a pack take one path.
     *
     * @private
     */
    private describe(name: string, rule: IAnalyzerRule, context: IAnalyzerRuleExecutionContext): IAnalyzerRuleResult {
        const result = rule.execute(context);
        const severity = severityOfRule(name, context.parameters.severities as Readonly<Record<string, RuleSeverity>> | undefined, rule.severity);

        result.severity = severity;
        result.findings = (result.findings ?? createRuleFindings(name, result, severity)).map((finding) => ({ ...finding, severity }));

        return result;
    }

    // #endregion

}
