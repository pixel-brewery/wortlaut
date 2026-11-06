// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackInspector } from './PackInspector';
import { RuleLockFile } from './RuleLockFile';
import { RulePackLoader } from './RulePackLoader';
import { createManifest, printManifest } from './testing/PackFixtures';

// #endregion

describe('RulePackLoader', () => {
  let root: string;
  let repository: string;

  const write = (path: string, content: string): void => {
    const file = join(repository, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const pin = (
    id: string,
    source: string,
    text: string,
    overrides: Record<string, unknown> = {},
  ): void => {
    const pack = PackInspector.inspect([{ path: 'wortlaut-pack.json', bytes: Buffer.from(text) }], {
      source: { kind: 'shipped', id },
      commit: null,
      version: null,
    });
    const lock = RuleLockFile.read(repository).lock;

    write(
      'wortlaut.lock.json',
      RuleLockFile.print({
        schemaVersion: 1,
        packs: {
          ...lock.packs,
          [id]: {
            name: pack.manifest.name,
            source,
            version: pack.version,
            commit: null,
            hash: pack.hash,
            rules: pack.ruleHashes,
            ...overrides,
          },
        },
      }),
    );
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-loader-')));
    repository = join(root, 'repo');
    mkdirSync(join(repository, '.git'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('has nothing to do without a lock file', () => {
    expect(RulePackLoader.load(repository)).toEqual({ directory: null, lock: null, packs: [] });
  });

  it('loads a pinned copy and a folder inside the repository that match their pins', () => {
    // arrange
    const text = printManifest(createManifest());
    const other = printManifest(
      createManifest({
        id: 'other-pack',
        rules: [{ id: 'other-rule', description: 'x', message: 'x', limit: { maxLength: 1 } }],
      }),
    );

    write('.wortlaut/rule-packs/our-pack/wortlaut-pack.json', text);
    write('rules/other/wortlaut-pack.json', other);
    pin('our-pack', 'github:o/r', text);
    pin('other-pack', 'folder:rules/other', other);

    // act
    const { packs } = RulePackLoader.load(repository);

    // assert
    expect(packs.map((pack) => [pack.id, pack.refusal, pack.enabled])).toEqual([
      ['other-pack', null, true],
      ['our-pack', null, true],
    ]);
    expect(packs[1].manifest?.rules).toHaveLength(3);
  });

  it('refuses a pack whose content changed, and names both hashes', () => {
    // arrange
    const text = printManifest(createManifest());

    pin('our-pack', 'github:o/r', text);
    write(
      '.wortlaut/rule-packs/our-pack/wortlaut-pack.json',
      text.replace('Remove TODO.', 'Keep TODO.'),
    );

    // act
    const [pack] = RulePackLoader.load(repository).packs;

    // assert
    expect(pack.manifest).toBeNull();
    expect(pack.enabled).toBe(false);
    expect(pack.foundHash).toMatch(/^sha256:/);
    expect(pack.foundHash).not.toBe(pack.entry.hash);
    expect(pack.refusal).toMatch(/does not match its pin, so its rules do not run/);
  });

  it('refuses a pack whose pinned copy is gone', () => {
    // arrange
    pin('our-pack', 'github:o/r', printManifest(createManifest()));

    // act & assert
    expect(RulePackLoader.load(repository).packs[0].refusal).toMatch(/missing/);
  });

  it('stays refused however a project feels about it', () => {
    // arrange
    pin('our-pack', 'github:o/r', printManifest(createManifest()));

    // act
    const [pack] = RulePackLoader.load(repository, []).packs;

    // assert
    expect(pack.enabled).toBe(false);
  });

  it('keeps a disabled pack verified, and off', () => {
    // arrange
    const text = printManifest(createManifest());

    write('.wortlaut/rule-packs/our-pack/wortlaut-pack.json', text);
    pin('our-pack', 'github:o/r', text);

    // act
    const [pack] = RulePackLoader.load(repository, ['our-pack']).packs;

    // assert
    expect(pack).toMatchObject({ refusal: null, enabled: false });
    expect(pack.manifest).not.toBeNull();
  });

  it('refuses a folder pin that leaves the repository, and never reads it', () => {
    // arrange
    const text = printManifest(createManifest());

    mkdirSync(join(root, 'outside'));
    writeFileSync(join(root, 'outside', 'wortlaut-pack.json'), text);
    pin('our-pack', 'folder:../outside', text);

    // act
    const [pack] = RulePackLoader.load(repository).packs;

    // assert
    expect(pack.manifest).toBeNull();
    expect(pack.refusal).toMatch(/points at a folder outside of the repository/);
  });

  it('refuses a definition that is a link, even with the right content', () => {
    // arrange
    const text = printManifest(createManifest());

    writeFileSync(join(root, 'real.json'), text);
    mkdirSync(join(repository, '.wortlaut/rule-packs/our-pack'), { recursive: true });
    symlinkSync(
      join(root, 'real.json'),
      join(repository, '.wortlaut/rule-packs/our-pack/wortlaut-pack.json'),
    );
    pin('our-pack', 'github:o/r', text);

    // act
    const [pack] = RulePackLoader.load(repository).packs;

    // assert
    expect(pack.manifest).toBeNull();
    expect(pack.refusal).toMatch(/is a link/);
  });

  it('refuses a folder that a link leads out of the repository', () => {
    // arrange
    const text = printManifest(createManifest());

    mkdirSync(join(root, 'outside'));
    writeFileSync(join(root, 'outside', 'wortlaut-pack.json'), text);
    symlinkSync(join(root, 'outside'), join(repository, 'rules'));
    pin('our-pack', 'folder:rules', text);

    // act & assert
    expect(RulePackLoader.load(repository).packs[0].refusal).toMatch(
      /leads outside of the repository/,
    );
  });

  it('refuses a definition that pins as another pack, and rules that collide', () => {
    // arrange
    const text = printManifest(createManifest());
    const twin = printManifest(createManifest({ id: 'twin-pack' }));

    write('.wortlaut/rule-packs/renamed/wortlaut-pack.json', text);
    pin('renamed', 'github:o/r', text);
    write('.wortlaut/rule-packs/our-pack/wortlaut-pack.json', text);
    write('.wortlaut/rule-packs/twin-pack/wortlaut-pack.json', twin);
    pin('our-pack', 'github:o/s', text);
    pin('twin-pack', 'github:o/t', twin);

    // act
    const packs = RulePackLoader.load(repository).packs;

    // assert
    expect(packs.find((pack) => pack.id === 'renamed')?.refusal).toMatch(
      /names the pack 'our-pack'/,
    );
    expect(packs.find((pack) => pack.id === 'our-pack')?.refusal).toBeNull();
    expect(packs.find((pack) => pack.id === 'twin-pack')?.refusal).toMatch(
      /same id as another rule/,
    );
  });

  it('says when the lock file itself cannot be read', () => {
    // arrange
    write('wortlaut.lock.json', 'nope');

    // act
    const loaded = RulePackLoader.load(repository);

    // assert
    expect(loaded.lock?.problem).toMatch(/not valid JSON/);
    expect(loaded.packs).toEqual([]);
  });
});
