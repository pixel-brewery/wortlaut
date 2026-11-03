// #region Imports

import { describe, expect, it } from 'vitest';
import { matchesKeyGlob } from './KeyGlob';

// #endregion

describe('matchesKeyGlob', () => {
    it.each([
        ['loc.a', 'loc.a', true],
        ['loc.*', 'loc.a.b', true],
        ['*.title', 'loc.orders.title', true],
        ['loc.*.title', 'loc.orders.title', true],
        ['loc.*', 'other.a', false],
        ['loc.a', 'loc.ab', false],
        ['*', '', true]
    ])('reads %s against %s', (pattern, key, expected) => {
        expect(matchesKeyGlob(pattern, key)).toBe(expected);
    });

    it('stays fast for a pattern that would make a regular expression backtrack', () => {
        // arrange
        const startedAt = performance.now();

        // act
        const matches = matchesKeyGlob('*a*a*a*a*a*a*a*a*b', 'a'.repeat(4000));

        // assert
        expect(matches).toBe(false);
        expect(performance.now() - startedAt).toBeLessThan(1000);
    });
});
