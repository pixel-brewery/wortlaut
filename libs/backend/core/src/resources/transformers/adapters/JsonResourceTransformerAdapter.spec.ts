// #region Imports

import { describe, expect, it } from 'vitest';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import { JsonResourceTransformerAdapter } from './JsonResourceTransformerAdapter';

// #endregion

function createResource(content: Record<string, unknown>): JsonResourceInfo {
    return new JsonResourceInfo({
        name: 'lang.de.json',
        path: '/i18n/lang.de.json',
        locale: 'de',
        content: () => content as never
    });
}

describe('JsonResourceTransformerAdapter', () => {
    it('transforms the same keys that the analysis sees', () => {
        // arrange
        const resource = createResource({
            'loc.orders.title': 'Aufträge',
            loc: { telephony: { label: 'Telefonie' } }
        });

        // act
        const models = new JsonResourceTransformerAdapter().transform(resource);

        // assert
        expect(models.map((model) => [model.key, model.value])).toEqual(resource.entries());
    });

    it('rejects a key that is written both flat and nested', () => {
        // arrange
        const resource = createResource({
            'loc.nav.label': 'Navigation',
            loc: { nav: { label: 'Menü' } }
        });

        // act
        const transform = (): unknown => new JsonResourceTransformerAdapter().transform(resource);

        // assert
        expect(transform).toThrowError("The resource '/i18n/lang.de.json' defines the key 'loc.nav.label' more than once");
    });
});
