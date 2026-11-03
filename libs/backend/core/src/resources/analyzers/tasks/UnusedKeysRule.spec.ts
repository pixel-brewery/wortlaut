// #region Imports

import { describe, expect, it } from 'vitest';
import { UnusedKeysRule } from './UnusedKeysRule';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import { UsedKeysFinder } from '../../../services/UsedKeysFinder';

// #endregion

describe('UnusedKeysRule', () => {
    it('reports only the keys that no source uses', () => {
        // arrange
        const resource = new JsonResourceInfo({
            locale: 'de',
            content: () => ({
                'loc.assemblies.fields.crewUserIds': 'Montageteam',
                'loc.assemblies.fields.legacy': 'Alt'
            })
        });

        // act
        const result = new UnusedKeysRule().execute({
            resource,
            parameters: {
                usedKeys: ['loc.assemblies.fields.crewUserIds']
            }
        });

        // assert
        expect(result.success).toBe(false);
        expect(result.data).toEqual([{ locale: 'de', unusedKeys: ['loc.assemblies.fields.legacy'] }]);
    });

    it('succeeds when the sources use every key', () => {
        // arrange
        const resource = new JsonResourceInfo({
            locale: 'de',
            content: () => ({ 'loc.assemblies.fields.crewUserIds': 'Montageteam' })
        });

        // act
        const result = new UnusedKeysRule().execute({
            resource,
            parameters: {
                usedKeys: new Set(['loc.assemblies.fields.crewUserIds'])
            }
        });

        // assert
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
    });

    it('reports the keys of a nested object one by one', () => {
        // arrange
        const resource = new JsonResourceInfo({
            locale: 'de',
            content: () => ({ loc: { telephony: { label: 'Telefonie', legacy: 'Alt' } } })
        });

        // act
        const result = new UnusedKeysRule().execute({
            resource,
            parameters: {
                usedKeys: ['loc.telephony.label']
            }
        });

        // assert
        expect(result.data).toEqual([{ locale: 'de', unusedKeys: ['loc.telephony.legacy'] }]);
    });

    it('keeps reporting an unused key next to the keys that a declared pattern covers', () => {
        // arrange
        const resource = new JsonResourceInfo({
            locale: 'de',
            content: () => ({ loc: { orders: { status: { open: 'Offen', closed: 'Geschlossen', archived: 'Archiviert' } } } })
        });
        const usedKeys = new UsedKeysFinder().find([], resource.keys(), { usedKeys: ['loc.orders.status.{open,closed}'] });

        // act
        const result = new UnusedKeysRule().execute({
            resource,
            parameters: {
                usedKeys
            }
        });

        // assert
        expect(result.data).toEqual([{ locale: 'de', unusedKeys: ['loc.orders.status.archived'] }]);
    });
});
