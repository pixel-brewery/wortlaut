// #region Imports

import { describe, expect, it } from 'vitest';
import { KeyGenerator } from './KeyGenerator';

// #endregion

describe('KeyGenerator', () => {
  it.each([
    ['loc', '', 'loc.ready.to.record'],
    ['loc.', '', 'loc.ready.to.record'],
    ['loc.app', '.label', 'loc.app.ready.to.record.label'],
    ['', 'label', 'ready.to.record.label'],
    ['', '', 'ready.to.record'],
  ])('generates a key with prefix %s and suffix %s', (prefix, suffix, expected) => {
    // act & assert
    expect(new KeyGenerator().generateWithAffixes('Ready to record', { prefix, suffix })).toBe(
      expected,
    );
  });

  it('leaves nothing to name a key after as an empty text', () => {
    // act & assert
    expect(new KeyGenerator().generateWithAffixes('…', { prefix: 'loc', suffix: '' })).toBe('');
  });
});
