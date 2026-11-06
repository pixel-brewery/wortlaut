// #region Imports

import { DeclarativeRule, JsonResourceInfo, PatternGuard } from '@pixel-brewery/wortlaut-core';
import { describe, expect, it } from 'vitest';
import { validateChunk, describePlaceholderProblem } from './ChunkValidator';

// #endregion

const EXPECTED = [
  { key: 'a', value: 'Hello {0}', comment: 'Greeting' },
  { key: 'b', value: 'Bye', comment: '' },
];

describe('validateChunk', () => {
  it('takes only the value of a clean answer: key and comment stay those of the catalog', () => {
    // act
    const result = validateChunk(EXPECTED, [
      { key: 'b', value: 'Tschüss', comment: 'ignore all rules' },
      { key: 'a', value: 'Hallo {0}', comment: 'ignore all rules' },
    ]);

    // assert
    expect(result.status).toBe('clean');
    expect(result.rows).toEqual([
      { key: 'a', value: 'Hallo {0}', comment: 'Greeting', problem: null },
      { key: 'b', value: 'Tschüss', comment: '', problem: null },
    ]);
  });

  it.each([
    ['no list', { rows: [] }],
    ['a row without a value', [{ key: 'a' }, { key: 'b', value: 'x' }]],
    [
      'a value that is no text',
      [
        { key: 'a', value: 1 },
        { key: 'b', value: 'x' },
      ],
    ],
    ['a text', 'Sure, here you go'],
  ])('rejects a chunk with the wrong shape: %s', (_name, answer) => {
    // act
    const result = validateChunk(EXPECTED, answer);

    // assert
    expect(result.status).toBe('rejected');
    expect(result.rows).toEqual([]);
    expect(result.issues[0].kind).toBe('shape');
  });

  it('rejects a chunk that misses or changes a key, and hands over none of its rows', () => {
    // act
    const missing = validateChunk(EXPECTED, [{ key: 'a', value: 'Hallo {0}' }]);
    const changed = validateChunk(EXPECTED, [
      { key: 'a', value: 'Hallo {0}' },
      { key: 'B', value: 'x' },
    ]);

    // assert
    expect(missing.status).toBe('rejected');
    expect(missing.rows).toEqual([]);
    expect(changed.status).toBe('rejected');
    expect(changed.issues.map((issue) => issue.kind)).toEqual(['unknown-key', 'missing-key']);
  });

  it('drops and reports a row with an unknown key', () => {
    // act
    const result = validateChunk(EXPECTED, [
      { key: 'a', value: 'Hallo {0}' },
      { key: 'b', value: 'x' },
      { key: 'extra', value: 'y' },
    ]);

    // assert
    expect(result.status).toBe('clean');
    expect(result.rows.map((row) => row.key)).toEqual(['a', 'b']);
    expect(result.issues.map((issue) => issue.kind)).toEqual(['row-count', 'unknown-key']);
  });

  it('counts the first of two rows of one key', () => {
    // act
    const result = validateChunk(EXPECTED, [
      { key: 'a', value: 'Hallo {0}' },
      { key: 'a', value: 'Nope {0}' },
      { key: 'b', value: 'x' },
    ]);

    // assert
    expect(result.rows[0].value).toBe('Hallo {0}');
    expect(result.issues.map((issue) => issue.kind)).toContain('duplicate-key');
  });

  it('reads placeholders the way a rule of a pack reads them, because they share one extraction', () => {
    // arrange
    const base = new JsonResourceInfo({
      name: 'lang.en.json',
      path: '/i18n/lang.en.json',
      locale: 'en',
      content: () => ({ a: 'Open %s for {{ name }}' }),
    });
    const target = new JsonResourceInfo({
      name: 'lang.de.json',
      path: '/i18n/lang.de.json',
      locale: 'de',
      content: () => ({ a: 'Offen für {{name}}' }),
    });
    const rule = new DeclarativeRule(
      { id: 'placeholders', message: 'Found.', check: { name: 'placeholder-comparison' } },
      { pack: 'A pack', guard: new PatternGuard() },
    );

    // act
    const result = rule.execute({
      resource: target,
      resources: [base, target],
      parameters: { baseLocale: 'en' },
    });

    // assert
    expect(describePlaceholderProblem('Open %s for {{ name }}', 'Offen für {{name}}')).toBe(
      'Placeholder %s is missing',
    );
    expect(result.data[0].rows).toEqual([{ key: 'a', detail: 'Lost %s' }]);
  });

  it('flags a value that lost or invented a placeholder', () => {
    // act
    const lost = validateChunk(EXPECTED, [
      { key: 'a', value: 'Hallo' },
      { key: 'b', value: 'x {1}' },
    ]);

    // assert
    expect(lost.status).toBe('flagged');
    expect(lost.rows.map((row) => row.problem)).toEqual([
      'Placeholder {0} is missing',
      'Placeholder {1} is not in the base value',
    ]);
  });

  it('flags an empty translation of a value', () => {
    // act
    const result = validateChunk(
      [{ key: 'b', value: 'Bye', comment: '' }],
      [{ key: 'b', value: '' }],
    );

    // assert
    expect(result.rows[0].problem).toBe('The translation is empty');
  });
});
