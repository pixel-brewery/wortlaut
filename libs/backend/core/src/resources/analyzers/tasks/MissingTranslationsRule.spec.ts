// #region Imports

import { describe, expect, it } from 'vitest';
import { MissingTranslationsRule } from './MissingTranslationsRule';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';

// #endregion

function createResource(locale: string, content: Record<string, string>, directory = '/crm/i18n'): JsonResourceInfo {
    return new JsonResourceInfo({
        name: `lang.${locale}.json`,
        path: `${directory}/lang.${locale}.json`,
        locale,
        content: () => content
    });
}

describe('MissingTranslationsRule', () => {
    it('reports the values that are identical to the base locale', () => {
        // arrange
        const en = createResource('en', { 'loc.orders.open': 'Open', 'loc.orders.title': 'Orders' });
        const nl = createResource('nl', { 'loc.orders.open': 'Open', 'loc.orders.title': 'Bestellingen' });

        // act
        const result = new MissingTranslationsRule().execute({ resource: nl, resources: [en, nl], parameters: { baseLocale: 'en' } });

        // assert
        expect(result.success).toBe(false);
        expect(result.data).toEqual([{ locale: 'nl', baseLocale: 'en', untranslatedKeys: ['loc.orders.open'] }]);
        expect(result.message).toBe("The locale 'nl' has 1 value(s) identical to the base locale 'en': loc.orders.open. Translate them, or declare values that need no translation with identicalValues or identicalKeys.");
    });

    it('leaves missing keys, empty values and values without letters to the other rules', () => {
        // arrange
        const en = createResource('en', { missing: 'Missing', empty: 'Empty', percent: '{0} %', count: '{{ count }}' });
        const nl = createResource('nl', { empty: '', percent: '{0} %', count: '{{ count }}' });

        // act
        const result = new MissingTranslationsRule().execute({ resource: nl, resources: [en, nl], parameters: { baseLocale: 'en' } });

        // assert
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
    });

    it('allows identical values declared by value or by key pattern', () => {
        // arrange
        const en = createResource('en', { 'loc.export.pdf': 'PDF', 'loc.integrations.datev.name': 'DATEV', 'loc.status': 'Status' });
        const de = createResource('de', { 'loc.export.pdf': 'PDF', 'loc.integrations.datev.name': 'DATEV', 'loc.status': 'Status' });

        // act
        const result = new MissingTranslationsRule().execute({
            resource: de,
            resources: [en, de],
            parameters: { baseLocale: 'en', identicalValues: ['PDF'], identicalKeys: ['loc.integrations.*.name'] }
        });

        // assert
        expect(result.data).toEqual([{ locale: 'de', baseLocale: 'en', untranslatedKeys: ['loc.status'] }]);
    });

    it('compares only with the base locale of the same catalog', () => {
        // arrange
        const otherCatalog = createResource('en', { 'loc.orders.open': 'Open' }, '/identity/i18n');
        const nl = createResource('nl', { 'loc.orders.open': 'Open' });

        // act
        const result = new MissingTranslationsRule().execute({ resource: nl, resources: [otherCatalog, nl], parameters: { baseLocale: 'en' } });

        // assert
        expect(result.success).toBe(true);
        expect(result.message).toBe("The catalog has no resource in the base locale 'en', so the values of 'nl' were not compared.");
    });
});
