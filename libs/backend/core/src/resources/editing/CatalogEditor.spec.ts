// #region Imports

import { Po, Resx } from '@pixel-brewery/utilities';
import { describe, expect, it } from 'vitest';
import { ResourceMode } from '../ResourceMode';
import { CatalogEditor } from './CatalogEditor';

// #endregion

describe('CatalogEditor', () => {
  describe('createLike', () => {
    it('keeps `__proto__` as a key and leaves the prototype of every object alone', () => {
      // act
      const text = CatalogEditor.createLike(
        '{ "__proto__": { "polluted": "a" }, "b": "B" }',
        ResourceMode.Json,
        [
          ['__proto__.polluted', 'yes'],
          ['constructor.prototype.polluted', 'yes'],
          ['b', 'B'],
        ],
      );

      // assert
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(text).toContain('"__proto__"');
      expect(CatalogEditor.entriesOf(text, ResourceMode.Json)).toContainEqual(['b', 'B']);
    });
  });

  describe('entriesOf', () => {
    it('reads a catalog from its text, in every format that can be read', () => {
      // act
      const json = CatalogEditor.entriesOf(
        '{ "loc": { "a": "A" }, "loc.b": "B" }',
        ResourceMode.Json,
      );
      const resx = CatalogEditor.entriesOf(
        '<?xml version="1.0"?><root><data name="loc.a"><value>A</value></data></root>',
        ResourceMode.Resx,
      );
      const po = CatalogEditor.entriesOf(
        'msgid ""\nmsgstr "Language: de"\n\nmsgid "loc.a"\nmsgstr "A \\"quoted\\""\n',
        ResourceMode.Po,
      );

      // assert
      expect(json).toEqual([
        ['loc.a', 'A'],
        ['loc.b', 'B'],
      ]);
      expect(resx).toEqual([['loc.a', 'A']]);
      expect(po).toEqual([['loc.a', 'A "quoted"']]);
    });

    it('reads a literal backslash of a PO catalog once, so it does not turn into an escape', () => {
      // act
      const po = CatalogEditor.entriesOf(
        'msgid "path"\nmsgstr "C:\\\\new\\\\table"\n',
        ResourceMode.Po,
      );

      // assert
      expect(po).toEqual([['path', 'C:\\new\\table']]);
    });

    it('reads a RESX value whose element has attributes, or no text', () => {
      // act
      const resx = CatalogEditor.entriesOf(
        '<root><data name="a"><value xml:space="preserve">A</value></data><data name="b"/></root>',
        ResourceMode.Resx,
      );

      // assert
      expect(resx).toEqual([
        ['a', 'A'],
        ['b', ''],
      ]);
    });
  });

  describe('JSON', () => {
    it('adds a key to a nested catalog at its place and keeps the rest of the file', () => {
      // arrange
      const text = '{\n    "loc": {\n        "b": "B",\n        "a": "A"\n    }\n}\n';

      // act
      const result = CatalogEditor.setValue(text, ResourceMode.Json, 'loc.nav.home', 'Home');

      // assert
      expect(result).toBe(
        '{\n    "loc": {\n        "b": "B",\n        "a": "A",\n        "nav": {\n            "home": "Home"\n        }\n    }\n}\n',
      );
    });

    it('adds a key to a flat catalog as a flat key', () => {
      // act
      const result = CatalogEditor.setValue(
        '{\n  "loc.a": "A"\n}\n',
        ResourceMode.Json,
        'loc.b',
        'B',
      );

      // assert
      expect(result).toBe('{\n  "loc.a": "A",\n  "loc.b": "B"\n}\n');
    });

    it('changes a value in place, flat or nested', () => {
      // act & assert
      expect(CatalogEditor.setValue('{"loc.a":"A","z":"Z"}', ResourceMode.Json, 'loc.a', 'Ä')).toBe(
        '{"loc.a":"Ä","z":"Z"}',
      );
      expect(CatalogEditor.setValue('{"loc":{"a":"A"}}', ResourceMode.Json, 'loc.a', 'Ä')).toBe(
        '{"loc":{"a":"Ä"}}',
      );
    });

    it('removes a key and the objects it leaves empty', () => {
      // act
      const result = CatalogEditor.removeKey(
        '{\n  "loc": {\n    "nav": {\n      "home": "Home"\n    },\n    "a": "A"\n  }\n}\n',
        ResourceMode.Json,
        'loc.nav.home',
      );

      // assert
      expect(JSON.parse(result)).toEqual({ loc: { a: 'A' } });
    });

    it('has no place for a comment', () => {
      // act & assert
      expect(CatalogEditor.supportsComments(ResourceMode.Json)).toBe(false);
      expect(() => CatalogEditor.setComment('{"a":"A"}', ResourceMode.Json, 'a', 'x')).toThrow(
        'no place',
      );
    });

    it('starts a new catalog that holds the key', () => {
      // act
      const result = CatalogEditor.setValue(
        CatalogEditor.empty(ResourceMode.Json),
        ResourceMode.Json,
        'loc.a',
        'A',
      );

      // assert
      expect(JSON.parse(result)).toEqual({ loc: { a: 'A' } });
    });
  });

  describe('RESX', () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<root>\n  <data name="b" xml:space="preserve">\n    <value>B</value>\n    <comment>Keep me</comment>\n  </data>\n  <data name="a" xml:space="preserve">\n    <value>A</value>\n  </data>\n</root>\n';

    it('changes a value and keeps order and comments', () => {
      // act
      const result = CatalogEditor.setValue(text, ResourceMode.Resx, 'a', 'x < y');

      // assert
      expect(result).toBe(text.replace('<value>A</value>', '<value>x &lt; y</value>'));
      expect(Resx.parse(result).entries.map((entry) => entry.key)).toEqual(['b', 'a']);
    });

    it('adds a key, sets and removes a comment, and removes a key', () => {
      // act
      const added = CatalogEditor.setValue(text, ResourceMode.Resx, 'c', 'C');
      const commented = CatalogEditor.setComment(added, ResourceMode.Resx, 'c', 'Note');
      const uncommented = CatalogEditor.setComment(text, ResourceMode.Resx, 'b', '');
      const removed = CatalogEditor.removeKey(added, ResourceMode.Resx, 'c');

      // assert
      expect(Resx.parse(commented).entries.at(-1)).toEqual({
        key: 'c',
        value: 'C',
        comment: 'Note',
      });
      expect(Resx.parse(uncommented).entries[0].comment).toBe('');
      expect(removed).toBe(text);
    });
  });

  describe('PO', () => {
    const text = '# Greeting\nmsgid "b"\nmsgstr "B"\n\nmsgid "a"\nmsgstr "A"\n';

    it('changes a value and keeps the rest', () => {
      // act & assert
      expect(CatalogEditor.setValue(text, ResourceMode.Po, 'a', 'say "hi"')).toBe(
        '# Greeting\nmsgid "b"\nmsgstr "B"\n\nmsgid "a"\nmsgstr "say \\"hi\\""\n',
      );
    });

    it('fills in a value the serializer left out', () => {
      // act & assert
      expect(
        CatalogEditor.setValue('msgid "a"\n\nmsgid "b"\nmsgstr "B"\n', ResourceMode.Po, 'a', 'A'),
      ).toBe('msgid "a"\nmsgstr "A"\n\nmsgid "b"\nmsgstr "B"\n');
    });

    it('adds a key, sets a comment and removes a key', () => {
      // act
      const added = CatalogEditor.setValue(text, ResourceMode.Po, 'c', 'C');
      const commented = CatalogEditor.setComment(added, ResourceMode.Po, 'a', 'Note');
      const removed = CatalogEditor.removeKey(added, ResourceMode.Po, 'c');

      // assert
      expect(Po.parse(commented).entries.map((entry) => [entry.msgid, entry.msgstr])).toEqual([
        ['b', 'B'],
        ['a', 'A'],
        ['c', 'C'],
      ]);
      expect(commented).toContain('# Note\nmsgid "a"');
      expect(Po.parse(removed).entries.map((entry) => entry.msgid)).toEqual(['b', 'a']);
    });
  });
});
