// #region Imports

import { describe, expect, it } from 'vitest';
import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import { JsonResourceSerializer } from './JsonResourceSerializer';
import { TypescriptResourceSerializer } from './TypescriptResourceSerializer';

// #endregion

const INFO = { name: 'lang.en.json', path: 'lang.en.json', locale: 'en' };

function modelsOf(entries: Record<string, string>): Array<IResourceModel> {
    return Object.entries(entries).map(([key, value]) => ({ key, value })) as unknown as Array<IResourceModel>;
}

describe('JsonResourceSerializer', () => {
    it('keeps every key of a catalog as data and leaves the prototype of every object alone', () => {
        // arrange
        const models = modelsOf({ '__proto__.polluted': 'yes', 'constructor.prototype.polluted': 'yes', 'a.b': 'C' });

        // act
        const content = new JsonResourceSerializer().serialize(models, INFO).content();

        // assert
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
        expect(JSON.stringify(content)).toBe('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"a":{"b":"C"}}');
    });

    it('still refuses a key that a value already holds', () => {
        // act & assert
        expect(() => new JsonResourceSerializer().serialize(modelsOf({ a: 'B', 'a.b': 'C' }), INFO)).toThrow(/already exists as a primitive value/);
    });
});

describe('TypescriptResourceSerializer', () => {
    it('keeps `__proto__` as a key like any other', () => {
        // act
        const content = new TypescriptResourceSerializer().serialize(modelsOf({ ['__proto__']: 'A', b: 'B' }), INFO).content();

        // assert
        expect(Object.entries(content)).toEqual([['__proto__', 'A'], ['b', 'B']]);
    });
});
