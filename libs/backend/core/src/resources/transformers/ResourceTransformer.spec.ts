// #region Imports

import { describe, expect, it } from 'vitest';
import { JsonResourceInfo } from '../models/JsonResourceInfo';
import { ResourceTransformer } from './ResourceTransformer';

// #endregion

describe('ResourceTransformer', () => {
  it('keeps the key order of the source resource when it serializes TypeScript', () => {
    // arrange
    const transformer = new ResourceTransformer(console);
    const source = new JsonResourceInfo({
      locale: 'de',
      content: () => ({
        'loc.orders.title': 'Aufträge',
        'loc.api.error.NOT_FOUND': 'Nicht gefunden',
        'loc.orders.hint': 'Hinweis',
      }),
    });

    // act
    const target = transformer.serialize(transformer.transform(source), {
      name: 'lang.de.ts',
      path: '/i18n/lang.de.ts',
      locale: 'de',
      target: 'ts',
    });

    // assert
    expect(target.keys()).toEqual([
      'loc.orders.title',
      'loc.api.error.NOT_FOUND',
      'loc.orders.hint',
    ]);
  });
});
