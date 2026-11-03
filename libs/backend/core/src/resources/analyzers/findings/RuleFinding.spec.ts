// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it } from 'vitest';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import { ResourceAnalyzer } from '../ResourceAnalyzer';
import { foundItemsOf, severityOfRule } from './RuleFinding';

// #endregion

const LOGGER = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as ILogger;

describe('findings of rules', () => {
    const en = new JsonResourceInfo({ name: 'lang.en.json', path: '/i18n/lang.en.json', locale: 'en', content: () => ({ a: 'Same', b: '' }) });
    const de = new JsonResourceInfo({ name: 'lang.de.json', path: '/i18n/lang.de.json', locale: 'de', content: () => ({ a: 'Same' }) });
    const analyzer = new ResourceAnalyzer(LOGGER);

    it.each([
        ['empty-values', en, 'b', 'error'],
        ['key-consistency', de, 'b', 'error'],
        ['missing-translations', de, 'a', 'warning']
    ])('gives the built-in rule %s findings in the one shape, with its severity', (rule, resource, key, severity) => {
        // act
        const result = analyzer.executeRule(rule, { resource, resources: [en, de], parameters: { baseLocale: 'en' } });

        // assert
        expect(result.severity).toBe(severity);
        expect(result.findings).toEqual([{ rule, key, locale: resource.locale, message: expect.any(String), severity }]);
    });

    it('has no findings for a rule that passed', () => {
        expect(analyzer.executeRule('duplicate-keys', { resource: en, parameters: {} }).findings).toEqual([]);
    });

    it('lets a project say what a rule is worth, and counts a rule that is off for what it is usually worth', () => {
        expect(severityOfRule('empty-values', { 'empty-values': 'warning' })).toBe('warning');
        expect(severityOfRule('empty-values', { 'empty-values': 'off' })).toBe('error');
        expect(severityOfRule('a-pack-rule', {}, 'error')).toBe('error');
        expect(severityOfRule('a-pack-rule')).toBe('warning');
    });

    it('reads what a rule found from every list the rules use', () => {
        expect(foundItemsOf([{ keys: ['a'] }, { unusedKeys: ['b'], locale: 'de' }])).toEqual(['a', 'b']);
        expect(foundItemsOf(null)).toEqual([]);
    });
});
