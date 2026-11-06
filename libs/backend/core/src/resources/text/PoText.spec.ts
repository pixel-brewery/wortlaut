// #region Imports

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, Po } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it } from 'vitest';
import { Formatters } from '../../formatters/Formatters';
import { CatalogEditor } from '../editing/CatalogEditor';
import { PoResourceInfo } from '../models/PoResourceInfo';
import { ResourceType } from '../models/interfaces/ResourceType';
import { PoResourceReaderAdapter } from '../readers/adapter/PoResourceReaderAdapter';
import { ResourceMode } from '../ResourceMode';
import { PoResourceTransformerAdapter } from '../transformers/adapters/PoResourceTransformerAdapter';
import { PoResourceSerializer } from '../transformers/serializers/PoResourceSerializer';
import { PoText } from './PoText';

// #endregion

const QUIET = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

/**
 * A value with everything a PO string has to escape.
 */
const HARD_VALUE = 'Say "hi" to C:\\temp\nnext line\tend';

describe('PO', () => {
  const folders = new Array<string>();

  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  function readBack(text: string): PoResourceInfo {
    const folder = mkdtempSync(join(tmpdir(), 'wortlaut-po-'));
    const file = join(folder, 'lang.de.po');

    folders.push(folder);
    writeFileSync(file, text);

    return new PoResourceReaderAdapter(new FileSystem(), QUIET as never).scanFile(
      file,
    ) as PoResourceInfo;
  }

  it('escapes quotes, backslashes and line breaks and reads them back', () => {
    // arrange
    const escaped = PoText.escape(HARD_VALUE);

    // act & assert
    expect(escaped).toBe('Say \\"hi\\" to C:\\\\temp\\nnext line\\tend');
    expect(Po.parse(`msgid "k"\nmsgstr "${escaped}"\n`).entries[0].msgstr).toBe(HARD_VALUE);
  });

  it('survives a round trip through the writer and the reader', () => {
    // arrange
    const resource = new PoResourceSerializer().serialize(
      [
        { key: 'a.hard', value: HARD_VALUE, comment: 'For the "hello" button' },
        { key: 'b.empty', value: '', comment: '' },
        { key: 'c.umlaut', value: 'Größe', comment: '' },
      ],
      { name: 'lang.de.po', path: '/virtual/lang.de.po', locale: 'de' },
    );

    // act
    const back = readBack(resource.toString());

    // assert
    expect(back.entries()).toEqual([
      ['a.hard', HARD_VALUE],
      ['b.empty', ''],
      ['c.umlaut', 'Größe'],
    ]);
    expect(
      new PoResourceTransformerAdapter()
        .transform(back)
        .map((model) => PoText.commentText(model.comment)),
    ).toEqual(['For the "hello" button', '', '']);
  });

  it('always writes msgstr, also for an empty value', () => {
    // arrange
    const resource = new PoResourceInfo({ content: () => [{ msgid: 'empty', msgstr: '' }] });

    // act & assert
    expect(resource.toString()).toBe('msgid "empty"\nmsgstr ""\n');
  });

  it('writes comments and references before the entry they belong to', () => {
    // arrange
    const resource = new PoResourceInfo({
      content: () => [
        { msgid: 'k', msgstr: 'v', comments: '# c', references: ['a.ts:1'], context: 'ctx' },
      ],
    });

    // act & assert
    expect(resource.toString()).toBe('# c\n#: a.ts:1\nmsgctxt "ctx"\nmsgid "k"\nmsgstr "v"\n');
  });

  it('keeps the header out of the keys and declares the charset', () => {
    // arrange
    const text = new PoResourceSerializer()
      .serialize([{ key: 'k', value: 'v', comment: '' }], {
        name: 'l.de.po',
        path: '/l.de.po',
        locale: 'de',
      })
      .toString();

    // act
    const back = readBack(text);

    // assert
    expect(text).toContain(
      'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\nLanguage: de\\n"',
    );
    expect(back.keys()).toEqual(['k']);
  });

  it('edits a value with quotes in a way the reader understands', () => {
    // act
    const edited = CatalogEditor.setValue(
      CatalogEditor.empty(ResourceMode.Po),
      ResourceMode.Po,
      'k',
      HARD_VALUE,
    );
    const again = CatalogEditor.setValue(edited, ResourceMode.Po, 'k', `${HARD_VALUE}!`);

    // assert
    expect(readBack(edited).entries()).toEqual([['k', HARD_VALUE]]);
    expect(readBack(again).entries()).toEqual([['k', `${HARD_VALUE}!`]]);
  });

  it('formats detected strings as PO, so detect --type po works', () => {
    // act
    const { content, changes } = Formatters.get(ResourceType.Po).format({
      'loc.save': 'Save "all"',
    });

    // assert
    expect(changes).toEqual({ 'loc.save': 'Save "all"' });
    expect(readBack(content).entries()).toEqual([['loc.save', 'Save "all"']]);
  });
});
