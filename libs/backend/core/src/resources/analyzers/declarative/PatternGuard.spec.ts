// #region Imports

import { describe, expect, it } from 'vitest';
import { PatternGuard } from './PatternGuard';

// #endregion

/**
 * A pattern that backtracks catastrophically, and an input that makes it. Without a bound this takes longer than any test run.
 */
const HOSTILE = '^(a+)+$';
const HOSTILE_INPUT = `${'a'.repeat(40)}!`;

describe('PatternGuard', () => {
  it('tests a harmless pattern, value by value', () => {
    // act
    const outcome = new PatternGuard().test('^todo', 'i', ['TODO later', 'done', 'todo']);

    // assert
    expect(outcome).toEqual({ kind: 'tested', matches: [true, false, true] });
  });

  it('stops a pattern that backtracks catastrophically within its bound', () => {
    // arrange
    const startedAt = performance.now();

    // act
    const outcome = new PatternGuard({ callMs: 100 }).test(HOSTILE, '', [HOSTILE_INPUT]);

    // assert
    expect(outcome.kind).toBe('stopped');
    expect(outcome).toMatchObject({ reason: expect.stringContaining('ran longer than 100 ms') });
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it('does not try a stopped pattern again', () => {
    // arrange
    const guard = new PatternGuard({ callMs: 50 });

    guard.test(HOSTILE, '', [HOSTILE_INPUT]);

    const startedAt = performance.now();

    // act
    const outcome = guard.test(HOSTILE, '', [HOSTILE_INPUT]);

    // assert
    expect(outcome).toMatchObject({
      kind: 'stopped',
      reason: expect.stringContaining('not tried again'),
    });
    expect(performance.now() - startedAt).toBeLessThan(25);
  });

  it('holds many hostile patterns of one analysis to one budget', () => {
    // arrange
    const guard = new PatternGuard({ callMs: 50, totalMs: 200 });
    const startedAt = performance.now();

    // act
    const outcomes = Array.from({ length: 40 }, (_, index) =>
      guard.test(`^(a+)+${'$'.repeat(index + 1)}`, '', [HOSTILE_INPUT]),
    );

    // assert
    expect(outcomes.every((outcome) => outcome.kind === 'stopped')).toBe(true);
    expect(outcomes.at(-1)).toMatchObject({ reason: expect.stringContaining('used up') });
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it('reads only the start of a very long value', () => {
    // act
    const outcome = new PatternGuard().test('end$', '', [`${'x'.repeat(100_000)}end`]);

    // assert
    expect(outcome).toEqual({ kind: 'tested', matches: [false] });
  });

  it('finds a pattern that does not compile, without running it', () => {
    expect(PatternGuard.findProblem('(', '')).toMatch(/Invalid regular expression/);
    expect(PatternGuard.findProblem(HOSTILE, '')).toBeNull();
  });

  it('runs nothing of a pattern as a script', () => {
    // act
    const outcome = new PatternGuard().test('process.exit(1)', '', [
      'process.exit(1)',
      'process.exit1',
    ]);

    // assert
    expect(outcome).toEqual({ kind: 'tested', matches: [false, true] });
  });
});
