// #region Imports

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChangeSetBuilder } from './ChangeSetBuilder';

// #endregion

describe('ChangeSetBuilder', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-builder-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists old and new content of a file and where the change comes from', () => {
    // arrange
    const file = join(root, 'lang.en.json');
    writeFileSync(file, 'old');
    const builder = createBuilder(root);

    // act
    builder.propose(file, 'new');
    const changeSet = builder.build(false);

    // assert
    expect(changeSet.source.command).toBe('sort');
    expect(changeSet.files).toEqual([
      {
        path: file,
        displayPath: 'lang.en.json',
        action: 'update',
        oldContent: 'old',
        oldHash: ChangeSetBuilder.hash(Buffer.from('old')),
        newContent: 'new',
        newHash: ChangeSetBuilder.hash(Buffer.from('new')),
      },
    ]);
  });

  it('marks a file that does not exist as created', () => {
    // arrange
    const builder = createBuilder(root);

    // act
    builder.propose(join(root, 'new.json'), '{}');
    const [file] = builder.build(false).files;

    // assert
    expect(file.action).toBe('create');
    expect(file.oldContent).toBeNull();
    expect(file.oldHash).toBeNull();
  });

  it('leaves out a file whose new content equals what was read', () => {
    // arrange
    const file = join(root, 'lang.en.json');
    writeFileSync(file, 'same');
    const builder = createBuilder(root);

    // act
    builder.propose(file, 'same');

    // assert
    expect(builder.build(false).files).toEqual([]);
  });

  it('compares against the snapshot, not against what the file holds by the end of a long run', () => {
    // arrange
    const file = join(root, 'lang.de.json');
    writeFileSync(file, 'before the run');
    const builder = createBuilder(root);

    // act
    builder.snapshot(file);
    writeFileSync(file, 'edited during the run');
    builder.propose(file, 'translated');
    const [entry] = builder.build(false).files;

    // assert
    expect(entry.oldContent).toBe('before the run');
  });

  it('hashes the bytes that were read, including a byte order mark', () => {
    // arrange
    const file = join(root, 'lang.en.resx');
    const bytes = Buffer.from('\uFEFF<root/>', 'utf8');
    writeFileSync(file, bytes);
    const builder = createBuilder(root);

    // act
    builder.propose(file, '<root/>');

    // assert
    expect(builder.build(false).files[0].oldHash).toBe(ChangeSetBuilder.hash(bytes));
  });

  it('hands over findings and whether the set is partial', () => {
    // arrange
    const builder = createBuilder(root);
    const finding = {
      rule: 'generate',
      severity: 'warning',
      message: 'short chunk',
      file: null,
      locale: 'de',
    } as const;

    // act
    builder.addFinding(finding);
    const changeSet = builder.build(true);

    // assert
    expect(changeSet.findings).toEqual([finding]);
    expect(changeSet.partial).toBe(true);
  });
});

function createBuilder(cwd: string): ChangeSetBuilder {
  return new ChangeSetBuilder('set-1', cwd, new Date('2026-11-02T10:00:00.000Z'), {
    command: 'sort',
    surface: 'cli',
    runId: 'run-1',
    detail: null,
  });
}
