// #region Imports

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceReader } from '../readers/ResourceReader';
import { ResourceMode } from '../ResourceMode';
import { CatalogComments, COMMENTS_FILE_NAME } from './CatalogComments';

// #endregion

const QUIET = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

describe('CatalogComments', () => {
  const folders = new Array<string>();

  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('names a catalog by its path without the locale, so every locale shares the comment of a key', () => {
    // act & assert
    expect(
      CatalogComments.catalogIdOf('/repo', { path: '/repo/libs/intl/lang.de.json', locale: 'de' }),
    ).toBe('libs/intl/lang.json');
    expect(
      CatalogComments.catalogIdOf('/repo', { path: '/repo/libs/intl/lang.en.json', locale: 'en' }),
    ).toBe('libs/intl/lang.json');
    expect(CatalogComments.catalogIdOf('/repo', { path: '/repo/lang.json', locale: '' })).toBe(
      'lang.json',
    );
  });

  it('keeps the comments of two resource roots with the same key apart', () => {
    // act
    const text = CatalogComments.set(
      CatalogComments.set(null, 'a/lang.json', 'loc.save', 'In a'),
      'b/lang.json',
      'loc.save',
      'In b',
    );

    // assert
    expect(CatalogComments.get(text, 'a/lang.json', 'loc.save')).toBe('In a');
    expect(CatalogComments.get(text, 'b/lang.json', 'loc.save')).toBe('In b');
  });

  it('removes an empty comment, and a catalog without comments', () => {
    // arrange
    const text = CatalogComments.set(null, 'a/lang.json', 'k', 'note');

    // act
    const removed = CatalogComments.set(text, 'a/lang.json', 'k', '');

    // assert
    expect(JSON.parse(removed)).toEqual({ schemaVersion: 1, catalogs: {} });
  });

  it('stays sorted, so an edit is one line of a diff', () => {
    // act
    const text = CatalogComments.set(CatalogComments.set(null, 'c', 'z', '1'), 'c', 'a', '2');

    // assert
    expect(Object.keys(JSON.parse(text).catalogs.c)).toEqual(['a', 'z']);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('refuses a file that holds something else', () => {
    // act & assert
    expect(() => CatalogComments.get('{"catalogs":{"a":{"k":1}}}', 'a', 'k')).toThrow(
      COMMENTS_FILE_NAME,
    );
  });

  it('is never read as a catalog, also with a resource root equal to the root of the repository', () => {
    // arrange
    const root = mkdtempSync(join(tmpdir(), 'wortlaut-comments-'));

    folders.push(root);
    mkdirSync(join(root, 'i18n'));
    writeFileSync(join(root, 'lang.en.json'), '{"loc":{"save":"Save"}}');
    writeFileSync(
      join(root, COMMENTS_FILE_NAME),
      CatalogComments.set(null, 'lang.json', 'loc.save', 'Button'),
    );
    writeFileSync(
      join(root, 'i18n', COMMENTS_FILE_NAME),
      '{"loc":{"other":"A string tree that looks like a catalog"}}',
    );

    const reader = new ResourceReader(QUIET as never, new FileSystem());

    // act
    const catalogs = reader.scanDirectory(root, ResourceMode.Json);

    // assert
    expect(catalogs.map((catalog) => catalog.name)).toEqual(['lang.en.json']);
    expect(reader.scanFile(join(root, COMMENTS_FILE_NAME), ResourceMode.Json)).toBeNull();
  });
});
