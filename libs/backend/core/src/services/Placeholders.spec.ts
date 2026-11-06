// #region Imports

import { describe, expect, it } from 'vitest';
import {
  comparePlaceholders,
  placeholdersOf,
  protectedTokensOf,
  removePlaceholders,
} from './Placeholders';

// #endregion

describe('protectedTokensOf', () => {
  it.each([
    ['Analysis with {0}', ['{0}']],
    ['Hello {name}, {{ count }} items', ['{name}', '{{count}}']],
    ['{{count}} and {{ count }}', ['{{count}}', '{{count}}']],
    ['%s of %1$d, %(name)s', ['%s', '%1$d', '%(name)s']],
    ['100 % sure', []],
    ['{count, plural, one {# item of {total}} other {# items}}', ['{count,plural}', '{total}']],
  ])('reads %s', (value, tokens) => {
    expect(protectedTokensOf(value)).toEqual(tokens);
  });
});

describe('comparePlaceholders', () => {
  it('finds what a translation lost and what it added', () => {
    // act & assert
    expect(comparePlaceholders('Ready · {0} sections', 'Prêt · sections')).toEqual({
      missing: ['{0}'],
      added: [],
    });
    expect(comparePlaceholders('Ready', 'Prêt {0}')).toEqual({ missing: [], added: ['{0}'] });
  });

  it('accepts another order and translated words of a nested message', () => {
    // act & assert
    expect(comparePlaceholders('{a} of {b}', '{b} von {a}')).toEqual({ missing: [], added: [] });
    expect(
      comparePlaceholders(
        '{n, plural, one {# item} other {# items}}',
        '{n, plural, one {# Element} other {# Elemente}}',
      ),
    ).toEqual({ missing: [], added: [] });
  });

  it('notices a placeholder that lost its repetition', () => {
    // act & assert
    expect(comparePlaceholders('{0} and {0}', '{0}')).toEqual({ missing: ['{0}'], added: [] });
  });
});

describe('removePlaceholders', () => {
  it('leaves the text to translate, and the same placeholders that placeholdersOf finds', () => {
    expect(removePlaceholders('Hello {name}, {0} %')).toBe('Hello ,  %');
    expect(placeholdersOf('Hello {name}, {0} %')).toEqual(['{name}', '{0}']);
  });
});
