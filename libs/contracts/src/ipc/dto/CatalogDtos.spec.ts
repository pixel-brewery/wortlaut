// #region Imports

import { describe, expect, it } from 'vitest';
import { CatalogKeysRequestSchema } from './CatalogDtos';

// #endregion

const REQUEST = {
  projectId: 'p1',
  namespace: null,
  search: '',
  filter: 'all',
  targetLocale: 'de',
  limit: 200,
};

describe('CatalogKeysRequestSchema', () => {
  it('keeps legacy first-page requests and accepts a bounded page beyond the old limit', () => {
    expect(CatalogKeysRequestSchema.parse(REQUEST)).toMatchObject({ offset: 0, limit: 200 });
    expect(CatalogKeysRequestSchema.parse({ ...REQUEST, offset: 5000 })).toMatchObject({
      offset: 5000,
      limit: 200,
    });
  });

  it('refuses invalid offsets and oversized pages', () => {
    expect(CatalogKeysRequestSchema.safeParse({ ...REQUEST, offset: -1 }).success).toBe(false);
    expect(CatalogKeysRequestSchema.safeParse({ ...REQUEST, offset: 1.5 }).success).toBe(false);
    expect(CatalogKeysRequestSchema.safeParse({ ...REQUEST, limit: 5001 }).success).toBe(false);
  });
});
