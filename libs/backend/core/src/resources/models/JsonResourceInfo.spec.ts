// #region Imports

import { describe, expect, it } from 'vitest';
import { JsonResourceInfo } from './JsonResourceInfo';

// #endregion

function createResource(content: Record<string, unknown>): JsonResourceInfo {
    return new JsonResourceInfo({
        name: 'lang.de.json',
        path: '/i18n/lang.de.json',
        locale: 'de',
        content: () => content as never
    });
}

describe('JsonResourceInfo', () => {
    it('sorts the keys of nested objects as well', () => {
        // arrange
        const resource = createResource({
            loc: { b: 'B', c: { y: 'Y', z: 'Z' }, a: 'A' }
        });

        // act
        resource.sort('desc');

        // assert
        expect(resource.entries().map(([key]) => key)).toEqual(['loc.c.z', 'loc.c.y', 'loc.b', 'loc.a']);
    });

    it('flattens nested objects to dotted keys', () => {
        // arrange
        const resource = createResource({
            'loc.orders.title': 'Aufträge',
            loc: { telephony: { label: 'Telefonie' } }
        });

        // act
        const keys = resource.keys();
        const entries = resource.entries();

        // assert
        expect(keys).toEqual(['loc.orders.title', 'loc.telephony.label']);
        expect(entries).toEqual([
            ['loc.orders.title', 'Aufträge'],
            ['loc.telephony.label', 'Telefonie']
        ]);
    });

    it('rejects a key that is written both flat and nested', () => {
        // arrange
        const resource = createResource({
            'loc.nav.label': 'Navigation',
            loc: { nav: { label: 'Menü' } }
        });

        // act
        const read = (): unknown => resource.keys();

        // assert
        expect(read).toThrowError("The resource '/i18n/lang.de.json' defines the key 'loc.nav.label' more than once through different nesting, for example as a flat key and inside a nested object. Keep one spelling per key.");
    });
});
