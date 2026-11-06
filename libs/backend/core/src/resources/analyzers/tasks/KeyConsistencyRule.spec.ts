// #region Imports

import { describe, expect, it } from 'vitest';
import { KeyConsistencyRule } from './KeyConsistencyRule';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';

// #endregion

function createResource(
  directory: string,
  locale: string,
  content: Record<string, string>,
): JsonResourceInfo {
  return new JsonResourceInfo({
    name: `lang.${locale}.json`,
    path: `${directory}/lang.${locale}.json`,
    locale,
    content: () => content,
  });
}

describe('KeyConsistencyRule', () => {
  it('reports the keys that another locale of the catalog defines and the locale lacks', () => {
    // arrange
    const de = createResource('/crm/i18n', 'de', {
      'loc.crm.a': 'A',
      'loc.crm.b': 'B',
      'loc.crm.c': 'C',
    });
    const nl = createResource('/crm/i18n', 'nl', { 'loc.crm.a': 'A' });

    // act
    const result = new KeyConsistencyRule().execute({
      resource: nl,
      resources: [de, nl],
      parameters: {},
    });

    // assert
    expect(result.success).toBe(false);
    expect(result.data).toEqual([
      {
        locale: 'nl',
        missingKeys: ['loc.crm.b', 'loc.crm.c'],
        isEmpty: false,
        comparedLocales: ['de'],
      },
    ]);
    expect(result.message).toBe(
      "The locale 'nl' is missing 2 key(s) that other locales of its catalog (de) define: loc.crm.b, loc.crm.c",
    );
  });

  it('reports every missing key for each locale of the catalog', () => {
    // arrange
    const de = createResource('/crm/i18n', 'de', { a: 'A', b: 'B' });
    const en = createResource('/crm/i18n', 'en', { a: 'A', c: 'C' });
    const uk = createResource('/crm/i18n', 'uk', { b: 'B' });
    const resources = [de, en, uk];

    // act
    const results = resources.map((resource) =>
      new KeyConsistencyRule().execute({ resource, resources, parameters: {} }),
    );

    // assert
    expect(results.map((result) => result.data)).toEqual([
      [{ locale: 'de', missingKeys: ['c'], isEmpty: false, comparedLocales: ['en', 'uk'] }],
      [{ locale: 'en', missingKeys: ['b'], isEmpty: false, comparedLocales: ['de', 'uk'] }],
      [{ locale: 'uk', missingKeys: ['a', 'c'], isEmpty: false, comparedLocales: ['de', 'en'] }],
    ]);
    expect(results.every((result) => !result.success)).toBe(true);
  });

  it('compares only with the locales of the same catalog', () => {
    // arrange
    const crm = createResource('/crm/i18n', 'de', { a: 'A', b: 'B' });
    const identity = createResource('/identity/i18n', 'nl', { a: 'A' });

    // act
    const result = new KeyConsistencyRule().execute({
      resource: identity,
      resources: [crm, identity],
      parameters: {},
    });

    // assert
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { locale: 'nl', missingKeys: [], isEmpty: false, comparedLocales: [] },
    ]);
  });

  it('reports a locale without keys', () => {
    // arrange
    const de = createResource('/crm/i18n', 'de', { a: 'A' });
    const nl = createResource('/crm/i18n', 'nl', {});

    // act
    const result = new KeyConsistencyRule().execute({
      resource: nl,
      resources: [de, nl],
      parameters: {},
    });

    // assert
    expect(result.success).toBe(false);
    expect(result.data).toEqual([
      { locale: 'nl', missingKeys: ['a'], isEmpty: true, comparedLocales: ['de'] },
    ]);
  });

  it('succeeds when every locale of the catalog defines the same keys', () => {
    // arrange
    const de = createResource('/crm/i18n', 'de', { a: 'A', b: 'B' });
    const nl = createResource('/crm/i18n', 'nl', { b: 'B', a: 'A' });

    // act
    const result = new KeyConsistencyRule().execute({
      resource: de,
      resources: [de, nl],
      parameters: {},
    });

    // assert
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { locale: 'de', missingKeys: [], isEmpty: false, comparedLocales: ['nl'] },
    ]);
  });
});
