// #region Imports

import { Json, Po, Resx } from '@pixel-brewery/utilities';
import { applyEdits, modify, parseTree, type JSONPath, type Node } from 'jsonc-parser';
import { JsonResourceInfo } from '../models/JsonResourceInfo';
import { ResourceType } from '../models/interfaces/ResourceType';
import { ResourceMode } from '../ResourceMode';
import { PoText } from '../text/PoText';

// #endregion

/**
 * An entry of a text-based catalog with its position in the text.
 */
interface ITextEntry {
    start: number;
    end: number;
    body: string;
}

/**
 * Edits the text of a catalog, one key at a time, and leaves everything else as it is: the order of the keys, nested or
 * flat JSON, formatting and line endings. It only works on text, so what becomes of the result is up to the caller.
 *
 * @public
 */
export namespace CatalogEditor {

    /**
     * Reads the keys and values out of the text of a catalog that is not on disk, such as what a pending change set would write.
     *
     * @public
     * @param text The text of the catalog.
     * @param type The format.
     * @returns The keys and values, with the keys of nested JSON flattened.
     */
    export function entriesOf(text: string, type: ResourceMode): Array<[key: string, value: string]> {
        switch (type) {
            case ResourceMode.Json:
                return new JsonResourceInfo({ type: ResourceType.Json, content: () => Json.parse(text).entries, locale: '', name: '', path: '' }).entries();
            case ResourceMode.Resx:
                return Resx.parse(text).entries.map((entry) => [entry.key, entry.value]);
            default:
                return Po.parse(text).entries
                    .filter((entry) => entry.msgid !== '')
                    .map((entry) => [entry.msgid, entry.msgstr ?? '']);
        }
    }

    /**
     * Returns whether a catalog format has a place for a comment. JSON has none: `CatalogComments` keeps them in a file of
     * their own.
     *
     * @public
     * @param type The format.
     * @returns `true` when comments can be kept.
     */
    export function supportsComments(type: ResourceMode): boolean {
        return type !== ResourceMode.Json;
    }

    /**
     * Returns the text of a catalog that holds nothing yet.
     *
     * @public
     * @param type The format.
     * @returns The text.
     */
    export function empty(type: ResourceMode): string {
        switch (type) {
            case ResourceMode.Json:
                return '{}\n';
            case ResourceMode.Resx:
                return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<root>\n</root>\n';
            default:
                return `msgid ""\nmsgstr "${PoText.escape(PoText.header(''))}"\n\n`;
        }
    }

    /**
     * Sets the value of a key, and adds the key when the catalog does not hold it.
     *
     * @public
     * @param text The text of the catalog.
     * @param type The format.
     * @param key The key.
     * @param value The value.
     * @returns The new text.
     */
    export function setValue(text: string, type: ResourceMode, key: string, value: string): string {
        switch (type) {
            case ResourceMode.Json:
                return setJsonValue(text, key, value);
            case ResourceMode.Resx:
                return setResxValue(text, key, value);
            default:
                return setPoValue(text, key, value);
        }
    }

    /**
     * Sets the values of several keys in one go. In JSON a value that exists is replaced where it stands, which takes one read of
     * the text however many keys change.
     *
     * @public
     * @param text The text of the catalog.
     * @param type The format.
     * @param entries The keys and values.
     * @returns The new text.
     */
    export function setValues(text: string, type: ResourceMode, entries: ReadonlyArray<readonly [key: string, value: string]>): string {
        if (type !== ResourceMode.Json) {
            return entries.reduce((current, [key, value]) => setValue(current, type, key, value), text);
        }

        const tree = parseJson(text);
        const missing = new Array<readonly [string, string]>();
        const edits = new Array<{ offset: number; length: number; content: string }>();

        for (const entry of entries) {
            const path = locateJsonKey(tree, entry[0]);
            const node = path ? nodeAt(tree, path) : undefined;

            if (node) {
                edits.push({ offset: node.offset, length: node.length, content: JSON.stringify(entry[1]) });
            } else {
                missing.push(entry);
            }
        }

        return missing.reduce((current, [key, value]) => setJsonValue(current, key, value), applyEdits(text, edits));
    }

    /**
     * Writes the catalog of a new locale that holds only some keys: in the order of the base catalog, nested or flat as it is,
     * with its formatting.
     *
     * @public
     * @param baseText The text of the catalog of the base locale.
     * @param type The format.
     * @param entries The keys and values, in the order of the base catalog.
     * @returns The text.
     */
    export function createLike(baseText: string, type: ResourceMode, entries: ReadonlyArray<readonly [key: string, value: string]>): string {
        if (type !== ResourceMode.Json) {
            return setValues(empty(type), type, entries);
        }

        const tree = parseJson(baseText);
        const { formattingOptions } = formattingOf(baseText);
        // Keys are text from a catalog. Without a prototype, `__proto__` stays a key and the walk below cannot reach `Object.prototype`.
        const content = Object.create(null) as Record<string, unknown>;

        for (const [key, value] of entries) {
            const path = locateJsonKey(tree, key) ?? [key];
            let node = content;

            for (const segment of path.slice(0, -1)) {
                node[segment] ??= Object.create(null);
                node = node[segment] as Record<string, unknown>;
            }

            node[path[path.length - 1]] = value;
        }

        const indent = formattingOptions.insertSpaces ? formattingOptions.tabSize : '\t';
        const body = JSON.stringify(content, null, indent).split('\n')
            .join(formattingOptions.eol);

        return (/\r?\n$/).test(baseText) ? `${body}${formattingOptions.eol}` : body;
    }

    /**
     * Removes a key. A nested JSON object that it leaves empty goes with it.
     *
     * @public
     * @param text The text of the catalog.
     * @param type The format.
     * @param key The key.
     * @returns The new text. A catalog without the key stays as it is.
     */
    export function removeKey(text: string, type: ResourceMode, key: string): string {
        switch (type) {
            case ResourceMode.Json:
                return removeJsonKey(text, key);
            case ResourceMode.Resx:
                return removeEntry(text, findResxEntry(text, key));
            default:
                return removeEntry(text, findPoEntry(text, key));
        }
    }

    /**
     * Sets the comment of a key.
     *
     * @public
     * @param text The text of the catalog.
     * @param type The format, which must have a place for comments.
     * @param key The key, which the catalog must hold.
     * @param comment The comment. An empty one removes it.
     * @returns The new text.
     * @throws Error when the format has no place for comments or the catalog does not hold the key.
     */
    export function setComment(text: string, type: ResourceMode, key: string, comment: string): string {
        if (type === ResourceMode.Json) {
            throw new Error('A JSON catalog has no place for a comment.');
        }

        const entry = type === ResourceMode.Resx ? findResxEntry(text, key) : findPoEntry(text, key);

        if (!entry) {
            throw new Error(`The catalog holds no key '${key}'.`);
        }

        const body = type === ResourceMode.Resx ? setResxComment(entry.body, comment) : setPoComment(entry.body, comment);

        return `${text.slice(0, entry.start)}${body}${text.slice(entry.end)}`;
    }

    // #region JSON

    /**
     * @private
     */
    function setJsonValue(text: string, key: string, value: string): string {
        const tree = parseJson(text);
        const path = locateJsonKey(tree, key) ?? newJsonPath(tree, key);

        return applyEdits(text, modify(text, path, value, formattingOf(text)));
    }

    /**
     * @private
     */
    function removeJsonKey(text: string, key: string): string {
        const tree = parseJson(text);
        const path = locateJsonKey(tree, key);

        if (!path) {
            return text;
        }

        let next = applyEdits(text, modify(text, path, undefined, formattingOf(text)));
        let parent = path.slice(0, -1);

        while (parent.length > 0 && isEmptyObject(parseJson(next), parent)) {
            next = applyEdits(next, modify(next, parent, undefined, formattingOf(next)));
            parent = parent.slice(0, -1);
        }

        return next;
    }

    /**
     * @private
     */
    function parseJson(text: string): Node | undefined {
        return parseTree(text) ?? undefined;
    }

    /**
     * @private
     */
    function isEmptyObject(root: Node | undefined, path: JSONPath): boolean {
        const node = path.reduce<Node | undefined>((current, segment) => childOf(current, String(segment))?.children?.[1], root);

        return node?.type === 'object' && (node.children?.length ?? 0) === 0;
    }

    /**
     * @private
     */
    function nodeAt(root: Node | undefined, path: JSONPath): Node | undefined {
        return path.reduce<Node | undefined>((current, segment) => childOf(current, String(segment))?.children?.[1], root);
    }

    /**
     * @private
     */
    function childOf(node: Node | undefined, name: string): Node | undefined {
        return node?.children?.find((property) => property.children?.[0]?.value === name);
    }

    /**
     * Finds the path of a key that the catalog holds, flat, nested or both at once.
     *
     * @private
     */
    function locateJsonKey(node: Node | undefined, key: string): JSONPath | null {
        for (const property of node?.children ?? []) {
            const name = String(property.children?.[0]?.value);
            const value = property.children?.[1];

            if (name === key && value?.type !== 'object') {
                return [name];
            }

            if (key.startsWith(`${name}.`) && value?.type === 'object') {
                const rest = locateJsonKey(value, key.slice(name.length + 1));

                if (rest) {
                    return [name, ...rest];
                }
            }
        }

        return null;
    }

    /**
     * Works out where a new key goes: below the deepest object that shares its start, and in the style of that object.
     * An object whose own keys hold dots is flat, so the rest of the new key stays one flat key as well.
     *
     * @private
     */
    function newJsonPath(root: Node | undefined, key: string): JSONPath {
        const path: JSONPath = [];
        let node = root;
        let rest = key;

        for (;;) {
            const next = (node?.children ?? []).find((property) => property.children?.[1]?.type === 'object' && rest.startsWith(`${String(property.children?.[0]?.value)}.`));

            if (!next) {
                break;
            }

            const name = String(next.children?.[0]?.value);

            path.push(name);
            rest = rest.slice(name.length + 1);
            node = next.children?.[1];
        }

        const isFlat = (node?.children ?? []).some((property) => String(property.children?.[0]?.value).includes('.'));

        return isFlat ? [...path, rest] : [...path, ...rest.split('.')];
    }

    /**
     * Reads the formatting of a text, so an edit looks like the rest of it.
     *
     * @private
     */
    function formattingOf(text: string): { formattingOptions: { insertSpaces: boolean; tabSize: number; eol: string } } {
        const indent = (/^([ \t]+)\S/m).exec(text)?.[1] ?? '  ';

        return {
            formattingOptions: {
                insertSpaces: !indent.startsWith('\t'),
                tabSize: indent.startsWith('\t') ? 1 : indent.length,
                eol: text.includes('\r\n') ? '\r\n' : '\n'
            }
        };
    }

    // #endregion

    // #region RESX

    /**
     * @private
     */
    function setResxValue(text: string, key: string, value: string): string {
        const entry = findResxEntry(text, key);

        if (entry) {
            const body = (/<value>/).test(entry.body)
                ? entry.body.replace(/<value>[\s\S]*?<\/value>/, () => `<value>${escapeXml(value)}</value>`)
                : entry.body.replace(/<value\s*\/>/, () => `<value>${escapeXml(value)}</value>`);

            return `${text.slice(0, entry.start)}${body}${text.slice(entry.end)}`;
        }

        const close = text.lastIndexOf('</root>');
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const block = `  <data name="${escapeXml(key)}" xml:space="preserve">${eol}    <value>${escapeXml(value)}</value>${eol}  </data>${eol}`;

        if (close < 0) {
            return `${text}${block}`;
        }

        return `${text.slice(0, close)}${block}${text.slice(close)}`;
    }

    /**
     * @private
     */
    function setResxComment(body: string, comment: string): string {
        if ((/<comment>[\s\S]*?<\/comment>|<comment\s*\/>/).test(body)) {
            return comment
                ? body.replace(/<comment>[\s\S]*?<\/comment>|<comment\s*\/>/, () => `<comment>${escapeXml(comment)}</comment>`)
                : body.replace(/\s*(?:<comment>[\s\S]*?<\/comment>|<comment\s*\/>)/, '');
        }

        return comment ? body.replace(/(\s*)(<\/data>)/, (_match, space: string, close: string) => `${space}  <comment>${escapeXml(comment)}</comment>${space}${close}`) : body;
    }

    /**
     * @private
     */
    function findResxEntry(text: string, key: string): ITextEntry | null {
        for (const match of text.matchAll(/[ \t]*<data\b[^>]*\bname="([^"]*)"[^>]*>[\s\S]*?<\/data>[ \t]*(?:\r?\n)?/g)) {
            if (unescapeXml(match[1]) === key) {
                return { start: match.index, end: match.index + match[0].length, body: match[0] };
            }
        }

        return null;
    }

    /**
     * @private
     */
    function escapeXml(value: string): string {
        return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @private
     */
    function unescapeXml(value: string): string {
        return value.replace(/&quot;/g, '"').replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    // #endregion

    // #region PO

    /**
     * @private
     */
    function setPoValue(text: string, key: string, value: string): string {
        const entry = findPoEntry(text, key);
        const line = `msgstr "${escapePo(value)}"`;

        if (entry) {
            // The serializer leaves `msgstr` out of an empty value.
            const body = (/^msgstr\s/m).test(entry.body)
                ? entry.body.replace(/^msgstr\s+"[^\n]*"\r?(?:\n"[^\n]*"\r?)*/m, () => line)
                : entry.body.replace(/^(msgid\s+"[^\n]*"\r?(?:\n"[^\n]*"\r?)*)/m, (id: string) => `${id}\n${line}`);

            return `${text.slice(0, entry.start)}${body}${text.slice(entry.end)}`;
        }

        const separator = text.length === 0 || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';

        return `${text}${separator}msgid "${escapePo(key)}"\n${line}\n`;
    }

    /**
     * @private
     */
    function setPoComment(body: string, comment: string): string {
        const lines = body.split('\n').filter((line) => !(/^#(?:\s|$)/).test(line));
        const comments = PoText.commentLines(comment.replace(/^#/gm, ''));

        return [...comments, ...lines].join('\n');
    }

    /**
     * Finds the block of a key: its comments and references, `msgctxt`, `msgid` and `msgstr`, up to the next blank line.
     *
     * @private
     */
    function findPoEntry(text: string, key: string): ITextEntry | null {
        const id = `msgid "${escapePo(key)}"`;

        for (const match of text.matchAll(/(?:^|(?<=\r?\n\r?\n))(?:(?!\r?\n\r?\n)[\s\S])+(?:\r?\n)*/g)) {
            if (match[0].split(/\r?\n/).some((line) => line.trim() === id)) {
                return { start: match.index, end: match.index + match[0].length, body: match[0] };
            }
        }

        return null;
    }

    /**
     * @private
     */
    function escapePo(value: string): string {
        return PoText.escape(value);
    }

    // #endregion

    /**
     * @private
     */
    function removeEntry(text: string, entry: ITextEntry | null): string {
        return entry ? `${text.slice(0, entry.start)}${text.slice(entry.end)}` : text;
    }

}
