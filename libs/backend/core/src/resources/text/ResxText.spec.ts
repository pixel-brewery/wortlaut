// #region Imports

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it } from 'vitest';
import { ResxResourceInfo } from '../models/ResxResourceInfo';
import { ResxResourceReaderAdapter } from '../readers/adapter/ResxResourceReaderAdapter';

// #endregion

const QUIET = { log: () => undefined, warn: () => undefined, error: () => undefined, info: () => undefined, debug: () => undefined };

describe('RESX', () => {
    const folders = new Array<string>();

    afterEach(() => {
        for (const folder of folders.splice(0)) {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    function read(text: string): ResxResourceInfo {
        const folder = mkdtempSync(join(tmpdir(), 'wortlaut-resx-'));
        const file = join(folder, 'lang.de.resx');

        folders.push(folder);
        writeFileSync(file, text);

        return new ResxResourceReaderAdapter(new FileSystem(), QUIET as never).scanFile(file) as ResxResourceInfo;
    }

    it('writes a catalog with a single key, and reads it back', () => {
        // arrange
        const resource = new ResxResourceInfo({ content: () => [{ key: 'only', value: 'A & <b>', comment: 'note' }] });

        // act
        const back = read(resource.toString());

        // assert
        expect(back.content()).toEqual([{ key: 'only', value: 'A & <b>', comment: 'note' }]);
    });

    it('keeps the order it is given, so a sort stays a sort', () => {
        // arrange
        const resource = new ResxResourceInfo({ content: () => [{ key: 'b', value: '2', comment: '' }, { key: 'a', value: '1', comment: '' }] });

        // act & assert
        expect(read(resource.toString()).keys()).toEqual(['b', 'a']);
    });

    it('reads a value whose element has attributes, or no text', () => {
        // act
        const back = read('<root><data name="a"><value xml:space="preserve">A</value></data><data name="b"/></root>');

        // assert
        expect(back.entries()).toEqual([['a', 'A'], ['b', '']]);
    });
});
