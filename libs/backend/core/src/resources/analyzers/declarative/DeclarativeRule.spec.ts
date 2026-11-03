// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it } from 'vitest';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import { ResourceAnalyzer } from '../ResourceAnalyzer';
import { DeclarativeRule, type IDeclarativeRuleData, type IDeclarativeRuleDefinition } from './DeclarativeRule';
import { PatternGuard } from './PatternGuard';

// #endregion

const LOGGER = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as ILogger;

function resource(locale: string, content: Record<string, string>): JsonResourceInfo {
    return new JsonResourceInfo({ name: `lang.${locale}.json`, path: `/crm/i18n/lang.${locale}.json`, locale, content: () => content });
}

function run(definition: Omit<IDeclarativeRuleDefinition, 'id' | 'message'> & { message?: string }, target: JsonResourceInfo, others: ReadonlyArray<JsonResourceInfo> = [], parameters: Record<string, unknown> = {}) {
    const rule = new DeclarativeRule({ id: 'a-rule', message: '{count} found in {locale}, base {baseLocale}.', ...definition }, { pack: 'A pack', guard: new PatternGuard() });
    const result = rule.execute({ resource: target, resources: [target, ...others], parameters: { baseLocale: 'en', ...parameters } });

    return { result, rows: (result.data as Array<IDeclarativeRuleData>).flatMap((entry) => entry.rows) };
}

describe('DeclarativeRule', () => {
    const en = resource('en', { greet: 'Hello {name}.', save: 'Save and stop', short: 'Ok', count: '{n, plural, one {# item} other {# items}}' });

    it('finds what a pattern matches, and says so with the message of the pack', () => {
        // act
        const { result, rows } = run({ pattern: { regex: 'TODO' } }, resource('de', { a: 'TODO later', b: 'Fertig' }));

        // assert
        expect(result.success).toBe(false);
        expect(result.message).toBe('1 found in de, base en.');
        expect(rows).toEqual([{ key: 'a', detail: 'TODO later' }]);
        expect(result.presentation?.pack).toBe('A pack');
    });

    it('can ask for a match instead, and can read keys', () => {
        // arrange
        const target = resource('de', { 'loc.a': 'x', other: 'y' });

        // act & assert
        expect(run({ pattern: { regex: '^loc\\.', target: 'key', when: 'no-match' } }, target).rows.map((row) => row.key)).toEqual(['other']);
    });

    it('limits the length of a value in characters, not in code units', () => {
        // arrange
        const target = resource('de', { long: 'abcdef', fits: '😀😀😀', tiny: 'a' });

        // act & assert
        expect(run({ limit: { maxLength: 3 } }, target).rows.map((row) => row.key)).toEqual(['long']);
        expect(run({ limit: { minLength: 2 } }, target).rows.map((row) => row.key)).toEqual(['tiny']);
    });

    it('stays inside its scope and out of what a project allowed', () => {
        // arrange
        const target = resource('de', { 'a.x': 'TODO', 'a.y': 'TODO', 'b.x': 'TODO' });

        // act & assert
        expect(run({ pattern: { regex: 'TODO' }, scope: { keys: ['a.*'] } }, target).rows.map((row) => row.key)).toEqual(['a.x', 'a.y']);
        expect(run({ pattern: { regex: 'TODO' }, scope: { locales: ['fr'] } }, target).result.success).toBe(true);
        expect(run({ pattern: { regex: 'TODO' } }, target, [], { ruleExceptions: { 'a-rule': ['a.*'] } }).rows.map((row) => row.key)).toEqual(['b.x']);
    });

    it('compares placeholders with the base locale', () => {
        // act
        const { rows } = run({ check: { name: 'placeholder-comparison' } }, resource('de', { greet: 'Hallo.', save: 'Speichern {0}', count: '{n, plural, one {# Ding} other {# Dinge}}' }), [en]);

        // assert
        expect(rows).toEqual([{ key: 'greet', detail: 'Lost {name}' }, { key: 'save', detail: 'Added {0}' }]);
    });

    it('parses ICU messages, without needing a base locale', () => {
        // act
        const { rows } = run({ check: { name: 'icu-parsing' } }, resource('de', { count: '{n, plural, one {# Ding}}', fine: 'Gut' }), [], { baseLocale: '' });

        // assert
        expect(rows).toEqual([{ key: 'count', detail: "The plural of 'n' has no 'other' case." }]);
    });

    it('compares the length of a value with the base locale and leaves short words alone', () => {
        // arrange
        const target = resource('de', { save: 'Speichern und beenden', short: 'Einverstanden' });

        // act
        const { rows } = run({ check: { name: 'length-ratio', maxRatio: 1.5, minBaseLength: 8 } }, target, [en]);

        // assert
        expect(rows).toEqual([{ key: 'save', detail: 'Save and stop / Speichern und beenden' }]);
    });

    it('compares final punctuation, in any script', () => {
        // arrange
        const base = resource('en', { a: 'Done.', b: 'Why?', c: 'Wait...', d: 'Plain' });

        // act
        const { rows } = run({ check: { name: 'punctuation' } }, resource('ja', { a: '完了。', b: 'なぜ', c: '待って…', d: 'Punkt.' }), [base]);

        // assert
        expect(rows.map((row) => row.key)).toEqual(['b', 'd']);
    });

    it('leaves empty values and keys the base lacks to the rules that own them', () => {
        // act
        const { result } = run({ check: { name: 'placeholder-comparison' } }, resource('de', { greet: '', extra: '{x}' }), [en]);

        // assert
        expect(result.success).toBe(true);
    });

    it('passes in the base locale itself and in a catalog without one', () => {
        // act & assert
        expect(run({ check: { name: 'punctuation' } }, en, [en]).result.success).toBe(true);
        expect(run({ check: { name: 'punctuation' } }, resource('de', { a: 'x.' })).result.success).toBe(true);
    });

    it('fails within its bound for a pattern that backtracks catastrophically, so an analysis cannot hang', () => {
        // arrange
        const guard = new PatternGuard({ callMs: 100 });
        const rule = new DeclarativeRule({ id: 'hostile', message: 'Nope.', pattern: { regex: '^(a+)+$' } }, { pack: 'A pack', guard });
        const target = resource('de', { a: `${'a'.repeat(40)}!` });
        const startedAt = performance.now();

        // act
        const result = rule.execute({ resource: target, resources: [target], parameters: {} });

        // assert
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/did not finish/);
        expect((result.data[0] as IDeclarativeRuleData).stopped).toMatch(/ran longer than/);
        expect(performance.now() - startedAt).toBeLessThan(2000);
    });

    it('takes the path of every other rule, with its severity on the result and findings in the one shape', () => {
        // arrange
        const analyzer = new ResourceAnalyzer(LOGGER);
        const target = resource('de', { a: 'TODO' });

        analyzer.registerRule('a-rule', new DeclarativeRule({ id: 'a-rule', severity: 'warning', message: 'Found.', pattern: { regex: 'TODO' } }, { pack: 'A pack', guard: new PatternGuard() }));

        // act
        const own = analyzer.executeRule('a-rule', { resource: target, parameters: {} });
        const raised = analyzer.executeRule('a-rule', { resource: target, parameters: { severities: { 'a-rule': 'error' } } });

        // assert
        expect(own.severity).toBe('warning');
        expect(own.findings).toEqual([{ rule: 'a-rule', key: 'a', locale: 'de', message: 'Found.', severity: 'warning' }]);
        expect(raised.severity).toBe('error');
        expect(raised.findings?.[0].severity).toBe('error');
    });
});
