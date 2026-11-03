// #region Imports

import { describe, expect, it } from 'vitest';
import { findIcuProblem } from './IcuMessage';

// #endregion

describe('findIcuProblem', () => {
    it.each([
        'Plain text',
        'Hello {name}',
        'Hello {{ name }}',
        '{0} of {1}',
        'Don\'t worry',
        'A quoted \'{brace}\' stays text',
        '{count, plural, one {# item} other {# items}}',
        '{count, plural, offset:1 =0 {nobody} one {# item} other {# items}}',
        '{gender, select, male {He} female {She} other {They}} said {count, plural, one {one} other {many}}',
        '{count, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
        '{when, date, short} at {when, time, ::jmm}',
        '{count, plural, one {{name} has # item} other {{name} has # items}}'
    ])('accepts %s', (value) => {
        expect(findIcuProblem(value)).toBeNull();
    });

    it.each([
        ['{count, plural, one {# item}}', /no 'other' case/],
        ['{gender, select, male {He}}', /no 'other' case/],
        ['{count, plural, one {# item} other {# items}', /no closing brace/],
        ['{count, plural, }', /no cases/],
        ['{count, plural, lots {# items} other {#}}', /unknown case 'lots'/],
        ['{count, plural, one other {#}}', /case without a name/],
        ['An open { brace', /no closing brace/],
        ['A closing } brace', /no opening brace/],
        ['{a {b}', /no closing brace/],
        ['{{ name }', /no closing brace/]
    ])('finds what is wrong with %s', (value, problem) => {
        expect(findIcuProblem(value)).toMatch(problem);
    });

    it('stops at a message that nests too deeply', () => {
        // arrange
        const nested = `${'{a, select, other {'.repeat(100)}x${'}}'.repeat(100)}`;

        // act & assert
        expect(findIcuProblem(nested)).toMatch(/nests too deeply/);
    });

    it('reads a long value in one pass', () => {
        // arrange
        const startedAt = performance.now();

        // act
        findIcuProblem('{a, select, other {'.repeat(20) + 'x'.repeat(500_000));

        // assert
        expect(performance.now() - startedAt).toBeLessThan(1000);
    });
});
