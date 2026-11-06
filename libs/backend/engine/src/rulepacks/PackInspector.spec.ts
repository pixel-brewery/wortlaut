// #region Imports

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackInspector } from './PackInspector';
import { PackProblem } from './PackProblem';
import { ShippedPacks } from './ShippedPacks';
import { createManifest, printManifest } from './testing/PackFixtures';

// #endregion

const FOLDER = { kind: 'folder', path: '/repo/rules' } as const;

function inspect(
  files: Record<string, string>,
  manifest: unknown = createManifest(),
): ReturnType<typeof PackInspector.inspect> {
  const all = {
    'wortlaut-pack.json': typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    ...files,
  };

  return PackInspector.inspect(
    Object.entries(all).map(([path, content]) => ({ path, bytes: Buffer.from(content) })),
    { source: FOLDER, commit: null, version: null },
  );
}

function problemOf(action: () => unknown): ReturnType<PackProblem['describe']> {
  try {
    action();
  } catch (error) {
    if (error instanceof PackProblem) {
      return error.describe();
    }

    throw error;
  }

  throw new Error('It did not refuse.');
}

describe('PackInspector', () => {
  it('checks a pack: its definitions, its hash and what it may do', () => {
    // arrange
    const text = printManifest(createManifest());

    // act
    const pack = inspect(
      {
        'README.md': 'Hello',
        LICENSE: 'MIT',
        'package.json': '{"name":"x","scripts":{"test":"vitest"}}',
      },
      text,
    );

    // assert
    expect(pack.manifest.id).toBe('our-pack');
    expect(pack.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(pack.text).toBe(text);
    expect(Object.keys(pack.ruleHashes)).toEqual(['no-todo', 'short-values', 'same-placeholders']);
    expect(pack.access).toEqual({
      declarative: true,
      readsCatalogs: true,
      readsSource: false,
      network: false,
      ai: false,
    });
  });

  it('computes the same hash for the same file, and another for any change', () => {
    // arrange
    const text = printManifest(createManifest());

    // act & assert
    expect(inspect({}, text).hash).toBe(inspect({ 'README.md': 'Other' }, text).hash);
    expect(inspect({}, text).hash).not.toBe(inspect({}, `${text} `).hash);
  });

  it('says what changed per rule through the hash of each rule', () => {
    // arrange
    const before = inspect({}, createManifest());
    const changed = createManifest();

    changed.rules[0] = { ...changed.rules[0], severity: 'warning' };

    // act
    const after = inspect({}, changed);

    // assert
    expect(after.ruleHashes['no-todo']).not.toBe(before.ruleHashes['no-todo']);
    expect(after.ruleHashes['short-values']).toBe(before.ruleHashes['short-values']);
  });

  it('says not a pack for what has no definition file', () => {
    // act
    const problem = problemOf(() =>
      PackInspector.inspect([{ path: 'README.md', bytes: Buffer.from('Hi') }], {
        source: FOLDER,
        commit: null,
        version: null,
      }),
    );

    // assert
    expect(problem).toMatchObject({
      kind: 'not-a-pack',
      message: expect.stringContaining('wortlaut-pack.json'),
    });
  });

  it.each([
    ['a script file', { 'install.js': 'process.exit(1)' }, 'install.js'],
    ['TypeScript', { 'src/rule.ts': 'export {}' }, 'src/rule.ts'],
    ['a binary', { 'native.node': 'x' }, 'native.node'],
    ['a WebAssembly module', { 'rule.wasm': 'x' }, 'rule.wasm'],
    ['a file without a known kind', { Makefile: 'all:' }, 'Makefile'],
    [
      'a script line in a file that looks like data',
      { 'data.json': '#!/bin/sh\nrm -rf /' },
      'data.json',
    ],
  ])('rejects a pack with code at the check: %s', (_name, files, path) => {
    // act
    const problem = problemOf(() => inspect(files));

    // assert
    expect(problem.kind).toBe('has-code');
    expect(problem.message).toMatch(/packs hold definitions only/);
    expect(problem.details).toContain(path);
  });

  it('rejects a package that asks for lifecycle scripts, and says none ever runs', () => {
    // act
    const problem = problemOf(() =>
      inspect({ 'package.json': '{"scripts":{"postinstall":"node evil.js","test":"vitest"}}' }),
    );

    // assert
    expect(problem).toMatchObject({
      kind: 'has-code',
      details: ['postinstall'],
      message: expect.stringContaining('never runs'),
    });
  });

  it.each([
    ['script', 'script'],
    ['function', 'function'],
    ['command', 'command'],
  ])('rejects a rule that names code in the field %s', (_name, field) => {
    // arrange
    const manifest = createManifest();
    const rules = [{ ...manifest.rules[0], [field]: 'process.exit(1)' }];

    // act
    const problem = problemOf(() => inspect({}, { ...manifest, rules }));

    // assert
    expect(problem).toMatchObject({ kind: 'has-code', details: [`rules.0.${field}`] });
  });

  it.each([
    ['an unknown field', { ...createManifest(), extra: 1 }, /extra/],
    ['no rules', createManifest({ rules: [] }), /rules/],
    [
      'a rule with two kinds',
      createManifest({
        rules: [
          {
            id: 'two',
            description: 'x',
            message: 'x',
            pattern: { regex: 'a' },
            limit: { maxLength: 1 },
          },
        ],
      }),
      /exactly one/,
    ],
    [
      'a rule without a kind',
      createManifest({ rules: [{ id: 'none', description: 'x', message: 'x' }] }),
      /exactly one/,
    ],
    [
      'an engine check that does not exist',
      createManifest({
        rules: [
          { id: 'x', description: 'x', message: 'x', check: { name: 'run-my-code' } as never },
        ],
      }),
      /check/,
    ],
    [
      'a flag with state',
      createManifest({
        rules: [{ id: 'x', description: 'x', message: 'x', pattern: { regex: 'a', flags: 'g' } }],
      }),
      /flags/,
    ],
    [
      'a pattern that does not compile',
      createManifest({
        rules: [{ id: 'x', description: 'x', message: 'x', pattern: { regex: '(' } }],
      }),
      /pattern is invalid/,
    ],
    [
      'a very long pattern',
      createManifest({
        rules: [{ id: 'x', description: 'x', message: 'x', pattern: { regex: 'a'.repeat(513) } }],
      }),
      /regex/,
    ],
    [
      'a rule id of a built-in rule',
      createManifest({
        rules: [{ id: 'empty-values', description: 'x', message: 'x', limit: { maxLength: 1 } }],
      }),
      /built-in rule/,
    ],
    [
      'a rule id twice',
      createManifest({
        rules: [
          { id: 'x', description: 'x', message: 'x', limit: { maxLength: 1 } },
          { id: 'x', description: 'x', message: 'x', limit: { maxLength: 2 } },
        ],
      }),
      /used twice/,
    ],
    ['a pack id that could leave a folder', createManifest({ id: '../evil' }), /id/],
    [
      'control characters that could fake a terminal',
      createManifest({ name: 'Evil\u001b[2J' }),
      /Control characters/,
    ],
  ])('names invalid definitions: %s', (_name, manifest, detail) => {
    // act
    const problem = problemOf(() => inspect({}, manifest));

    // assert
    expect(problem.kind).toBe('invalid');
    expect(problem.details.join('\n')).toMatch(detail);
  });

  it('says invalid for a file that is no JSON or too large', () => {
    expect(problemOf(() => inspect({}, 'not json'))).toMatchObject({
      kind: 'invalid',
      message: expect.stringContaining('not valid JSON'),
    });
    expect(
      problemOf(() => inspect({}, JSON.stringify({ padding: ' '.repeat(1024 * 1024 + 1) }))).kind,
    ).toBe('too-large');
  });

  describe('the Message checks pack', () => {
    const [shipped] = ShippedPacks.all();

    it('is data in the format of any other pack, and passes the same check', () => {
      // act
      const pack = PackInspector.inspect(
        [{ path: 'wortlaut-pack.json', bytes: Buffer.from(shipped.text) }],
        { source: { kind: 'shipped', id: shipped.id }, commit: null, version: null },
      );

      // assert
      expect(pack.manifest.name).toBe('Message checks');
      expect(pack.manifest.rules.map((rule) => rule.id)).toEqual([
        'placeholder-consistency',
        'icu-syntax',
        'text-expansion',
        'trailing-punctuation',
      ]);
      expect(pack.manifest.rules.map((rule) => rule.check?.name)).toEqual([
        'placeholder-comparison',
        'icu-parsing',
        'length-ratio',
        'punctuation',
      ]);
    });

    it('is the text of its file, so a copy of the file in a folder has the same hash', () => {
      expect(shipped.text).toBe(
        readFileSync(join(__dirname, 'shipped/message-checks/wortlaut-pack.json'), 'utf8'),
      );
    });
  });
});
