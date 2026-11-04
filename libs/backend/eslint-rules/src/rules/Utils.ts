// #region Imports

import { readdirSync } from 'node:fs';
import { type IResourceInfo, JsonResourceInfo, ResourceType, ResxResourceInfo, PoResourceInfo } from '@pixel-brewery/wortlaut-core';
import { FileSystem, Json, Po, Resx } from '@pixel-brewery/utilities';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

// #endregion

/**
 * Creates a resource of Wortlaut from the raw text of a resource file.
 *
 * @param content The raw text, or a function that reads it when the keys are read first, so that resources that a rule
 * filters out are never read.
 * @param type The type of the resource.
 * @param locale The locale of the resource.
 * @param path The path of the resource file, which identifies its catalog.
 * @returns The resource.
 */
export function createResourceFromContent(content: string | (() => string), type: ResourceType, locale: string, path = ''): IResourceInfo {
    const text = (): string => typeof content === 'string' ? content : content();

    switch (type) {
        case ResourceType.Json:
            return new JsonResourceInfo({
                type: ResourceType.Json,
                content: () => {
                    const p = Json.parse(text()).entries;
                    return p;
                },
                locale: locale,
                path: path
            });
        case ResourceType.Resx:
            return new ResxResourceInfo({
                type: ResourceType.Resx,
                content: () => {
                    const p = Resx.parse(text()).entries;
                    return p;
                },
                locale: locale,
                path: path
            });
        case ResourceType.Po:
            return new PoResourceInfo({
                type: ResourceType.Po,
                content: () => {
                    const p = Po.parse(text()).entries;
                    return p;
                },
                locale: locale,
                path: path
            });
        case ResourceType.TypeScript:
        default:
            throw new Error(`Resource type not supported: ${type}`);
    }
}

/**
 * Creates the listener of a resource rule, which analyzes the resource once on the root node of the file.
 *
 * @remarks
 * The root is `Program` for parsers that produce an ESTree root, such as `jsonc-eslint-parser` or a text parser for
 * resx and po files, and `Document` for the languages of `@eslint/json` (`json/json`, `json/jsonc`, `json/json5`), with
 * which the shared configuration lints JSON files.
 *
 * @param analyze Analyzes the resource and reports on the root node.
 * @returns The rule listener.
 */
export function createResourceListener(analyze: TSESLint.RuleFunction<TSESTree.Node>): TSESLint.RuleListener {
    return {
        Program: analyze,
        Document: analyze
    };
}

/**
 * Determines whether a resource defines a key through different nesting, for example the flat key `"nav.label"` next to
 * `{ "nav": { "label": … } }`.
 *
 * @remarks
 * `JsonResourceInfo` rejects such a JSON resource with an error as soon as its keys are read, so a rule that reads them
 * would fail the whole lint run. The `duplicate-keys` rule reports these keys from the raw text; the other resource
 * rules skip the resource.
 *
 * @param resource The resource.
 * @returns `true` if the keys of the resource are ambiguous.
 */
export function hasAmbiguousKeys(resource: IResourceInfo): boolean {
    if (resource.type !== ResourceType.Json) {
        return false;
    }

    try {
        resource.keys();

        return false;
    } catch {
        return true;
    }
}

/**
 * Reads the other locales of the catalog of a resource file from disk: the files of the same type in the same
 * directory whose names differ only in the locale segment, such as `lang.de.json` and `lang.nl.json`, and a
 * default-locale file without a locale segment, such as `lang.json`. This is the catalog of Wortlaut
 * (`getOtherCatalogLocales`), whose rules expect the other locales in `context.resources`.
 *
 * @param filename The path of the linted resource file.
 * @param type The type of the resource.
 * @param locale The locale of the resource.
 * @returns The resources of the other locales, sorted by file name; their text is read when their keys are read.
 */
export function readCatalogResources(filename: string, type: ResourceType, locale: string): Array<IResourceInfo> {
    const fileSystem = new FileSystem();
    const normalized = filename.replace(/\\/g, '/');
    const directory = normalized.slice(0, normalized.lastIndexOf('/') + 1);
    const catalog = getCatalogFileName(normalized.slice(directory.length), locale);
    let files: Array<string>;

    try {
        files = readdirSync(directory || '.').sort((a, b) => a.localeCompare(b));
    } catch {
        // A file that is linted from text only, such as a stdin source, has no directory to read.
        return [];
    }

    return files
        .map((file) => ({
            file,
            fileLocale: fileSystem.fileGetLocale(file)
        }))
        .filter(({ file, fileLocale }) => fileLocale !== locale && getCatalogFileName(file, fileLocale) === catalog)
        .map(({ file }) => `${directory}${file}`)
        .filter((path) => path !== normalized && fileSystem.fileExists(path))
        .map((path) => createResourceFromContent(() => fileSystem.fileReadAllText(path), type, fileSystem.fileGetLocale(path), path));
}

/**
 * The file name of a resource without its locale segment, like the catalog of Wortlaut.
 *
 * @private
 */
function getCatalogFileName(fileName: string, locale: string): string {
    const localeSegment = `.${locale}.`;
    const localeIndex = fileName.lastIndexOf(localeSegment);

    return localeIndex >= 0
        ? `${fileName.slice(0, localeIndex)}${fileName.slice(localeIndex + localeSegment.length - 1)}`
        : fileName;
}

/**
 * Reads the keys of a JSON resource from its raw text: every spelling of every key, in document order.
 *
 * @remarks
 * The keys are flattened like `JsonResourceInfo.entries()`: nested objects and arrays are levels of their keys, so
 * `{ "nav": { "label": "Menu" } }` and `{ "nav.label": "Menu" }` both spell the key `nav.label`. A JSON parser such as
 * jsonc-parser keeps only the last value of a key that an object repeats; the raw text keeps every spelling, so a key
 * that occurs more than once in the result is a duplicate. Comments and trailing commas are skipped like jsonc-parser
 * skips them, and malformed text yields the keys up to the error instead of an exception.
 *
 * @param content The raw text of the JSON resource.
 * @returns The flattened keys.
 */
export function readJsonKeys(content: string): Array<string> {
    return readJsonKeyLocations(content).map((location) => location.key);
}

/**
 * A spelling of a resource key in the raw text of the resource.
 *
 * @public
 */
export interface IResourceKeyLocation {

    /**
     * The flattened key.
     */
    key: string;

    /**
     * The offset of the first character of the spelling.
     */
    start: number;

    /**
     * The offset after the last character of the spelling.
     */
    end: number;

}

/**
 * Reads the keys of a JSON resource from its raw text like {@link readJsonKeys}, with the range of each spelling: the
 * property name of an object member, or the value of an array element.
 *
 * @param content The raw text of the JSON resource.
 * @returns The flattened keys and their ranges, in document order.
 */
export function readJsonKeyLocations(content: string): Array<IResourceKeyLocation> {
    const keys = new Array<IResourceKeyLocation>();
    let index = 0;

    const join = (key: string, segment: string): string => key ? `${key}.${segment}` : segment;

    const skipTrivia = (): void => {
        while (index < content.length) {
            if (content.startsWith('//', index)) {
                const end = content.indexOf('\n', index);
                index = end < 0 ? content.length : end + 1;
            } else if (content.startsWith('/*', index)) {
                const end = content.indexOf('*/', index + 2);
                index = end < 0 ? content.length : end + 2;
            } else if ((/\s/).test(content[index])) {
                index++;
            } else {
                return;
            }
        }
    };

    const readString = (): string => {
        const start = index;

        index++;

        while (index < content.length && content[index] !== '"') {
            index += content[index] === '\\' ? 2 : 1;
        }

        index++;

        const token = content.slice(start, index);

        try {
            return JSON.parse(token) as string;
        } catch {
            return token.slice(1, -1);
        }
    };

    // `name` is the range of the property name of an object member; array elements and the root are spelled by their value.
    const readValue = (key: string, name?: [number, number]): void => {
        skipTrivia();

        if (index >= content.length) {
            return;
        }

        const char = content[index];
        const valueStart = index;

        if (char === '{' || char === '[') {
            const isObject = char === '{';
            const close = isObject ? '}' : ']';
            let position = 0;

            index++;
            skipTrivia();

            while (index < content.length && content[index] !== close) {
                const start = index;

                if (!isObject) {
                    readValue(join(key, String(position++)));
                } else if (content[index] === '"') {
                    const nameStart = index;
                    const segment = readString();
                    const nameEnd = index;

                    skipTrivia();

                    if (content[index] === ':') {
                        index++;
                    }

                    readValue(join(key, segment), [nameStart, nameEnd]);
                }

                skipTrivia();

                if (content[index] === ',') {
                    index++;
                    skipTrivia();
                }

                // Malformed text: skip the unexpected character instead of reading it again.
                if (index === start) {
                    index++;
                }
            }

            index++;

            return;
        }

        if (char === '"') {
            readString();
        } else {
            while (index < content.length && !(/[\s,:\]}/]/).test(content[index])) {
                index++;
            }
        }

        const [start, end] = name ?? [valueStart, index];

        keys.push({
            key,
            start,
            end
        });
    };

    readValue('');

    return keys;
}

/**
 * Reads the keys of a resource from its raw text, with the range of each spelling: the property names of JSON, the
 * `name` attributes of the resx `data` elements and the single-line `msgid` strings of po files.
 *
 * @param content The raw text of the resource.
 * @param type The type of the resource.
 * @returns The keys and their ranges, in document order.
 */
export function readResourceKeyLocations(content: string, type: ResourceType): Array<IResourceKeyLocation> {
    switch (type) {
        case ResourceType.Json:
            return readJsonKeyLocations(content);
        case ResourceType.Resx:
            return readKeyMatches(content, /<data\b[^>]*?\bname\s*=\s*(["'])(.*?)\1/dgs, 2, (value) => value
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, '\'')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&'));
        case ResourceType.Po:
            return readKeyMatches(content, /^[ \t]*msgid[ \t]+"((?:[^"\\]|\\.)*)"/dgm, 1, (value) => {
                try {
                    return JSON.parse(`"${value}"`) as string;
                } catch {
                    return value;
                }
            });
        case ResourceType.TypeScript:
        default:
            return [];
    }
}

/**
 * @private
 */
function readKeyMatches(content: string, pattern: RegExp, group: number, decode: (value: string) => string): Array<IResourceKeyLocation> {
    return Array.from(content.matchAll(pattern)).flatMap((match) => {
        const range = match.indices?.[group];

        return range
            ? [{
                key: decode(match[group]),
                start: range[0],
                end: range[1]
            }]
            : [];
    });
}

/**
 * Locates the spellings of the keys of a resource, so that a resource rule reports each key at its own position.
 *
 * @remarks
 * The positions come from `getLocFromIndex` of the source code, so they follow the column base of the language: the
 * `@eslint/json` languages count columns from 1, ESTree parsers from 0.
 *
 * @param sourceCode The source code of the linted resource.
 * @param type The type of the resource.
 * @returns A function that returns the location of the given spelling of a key (by default the last one, whose value
 * the parsers keep), or `undefined` if the resource does not spell the key, for example a missing key.
 */
export function createKeyLocator(sourceCode: IResourceSourceCode, type: ResourceType): (key: string, occurrence?: number) => TSESTree.SourceLocation | undefined {
    const locations = new Map<string, Array<IResourceKeyLocation>>();

    readResourceKeyLocations(sourceCode.text, type).forEach((location) => {
        locations.set(location.key, [...locations.get(location.key) ?? [], location]);
    });

    return (key, occurrence) => {
        const spellings = locations.get(key) ?? [];
        const location = spellings.at(occurrence ?? -1);

        return location
            ? {
                start: sourceCode.getLocFromIndex(location.start),
                end: sourceCode.getLocFromIndex(location.end)
            }
            : undefined;
    };
}

/**
 * The part of the source code of a linted resource that {@link createKeyLocator} reads. Both the ESTree source code and
 * the source code of the `@eslint/json` languages provide it.
 *
 * @public
 */
export interface IResourceSourceCode {

    /**
     * The raw text.
     */
    readonly text: string;

    /**
     * Converts an offset of the text into a position.
     */
    getLocFromIndex(index: number): TSESTree.Position;

}

/**
 * Creates the target of a report: the location of a key, or the root node if the resource does not spell the key.
 *
 * @param node The root node.
 * @param loc The location of the key.
 * @returns The `node` or `loc` of the report descriptor.
 */
export function reportTarget(node: TSESTree.Node, loc: TSESTree.SourceLocation | undefined): { node: TSESTree.Node } | { loc: TSESTree.SourceLocation } {
    return loc ? { loc } : { node };
}
