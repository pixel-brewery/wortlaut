// #region Imports

import { relative } from 'node:path';
import type { IResourceInfo } from '../models/interfaces/IResourceInfo';

// #endregion

/**
 * The file in which a JSON project keeps its comments, next to `wortlaut.config.json`. A scan never reads it as a catalog.
 *
 * @public
 */
export const COMMENTS_FILE_NAME = 'wortlaut.comments.json';

/**
 * The version of the shape of that file.
 */
const SCHEMA_VERSION = 1;

/**
 * The shape of the comments file: per catalog, per key.
 */
interface ICommentsFile {
    schemaVersion: number;
    catalogs: Record<string, Record<string, string>>;
}

/**
 * Reads and writes the comments of JSON catalogs. A JSON catalog has no place for a comment, so they live in one file of the
 * repository. Each catalog has its own entry, named by its path without the locale, so several resource roots cannot
 * collide and every locale of a catalog shares the comment of a key. It only works on text: whoever calls it decides what
 * becomes of the result, through a change set.
 *
 * @public
 */
export namespace CatalogComments {

    /**
     * Returns the name a catalog has in the comments file: its path below the folder of the file, without the locale.
     *
     * @public
     * @param folder The folder of the comments file.
     * @param catalog The catalog.
     * @returns For example `libs/intl/lang.json`.
     */
    export function catalogIdOf(folder: string, catalog: Pick<IResourceInfo, 'path' | 'locale'>): string {
        const path = relative(folder, catalog.path).replace(/\\/g, '/');
        const directoryLength = path.lastIndexOf('/') + 1;
        const name = path.slice(directoryLength);
        const segment = `.${catalog.locale}.`;
        const index = catalog.locale ? name.lastIndexOf(segment) : -1;

        return `${path.slice(0, directoryLength)}${index >= 0 ? `${name.slice(0, index)}${name.slice(index + segment.length - 1)}` : name}`;
    }

    /**
     * Returns the comment of a key.
     *
     * @public
     * @param text The text of the comments file, or `null` when there is none.
     * @param catalogId The name of the catalog.
     * @param key The key.
     * @returns The comment, or an empty text.
     */
    export function get(text: string | null, catalogId: string, key: string): string {
        return read(text).catalogs[catalogId]?.[key] ?? '';
    }

    /**
     * Returns all comments of a catalog.
     *
     * @public
     * @param text The text of the comments file, or `null` when there is none.
     * @param catalogId The name of the catalog.
     * @returns The comments by key.
     */
    export function ofCatalog(text: string | null, catalogId: string): Readonly<Record<string, string>> {
        return read(text).catalogs[catalogId] ?? {};
    }

    /**
     * Sets the comment of a key. An empty comment removes it, and a catalog without comments leaves the file.
     *
     * @public
     * @param text The text of the comments file, or `null` when there is none.
     * @param catalogId The name of the catalog.
     * @param key The key.
     * @param comment The comment.
     * @returns The new text. Catalogs and keys stay sorted, so an edit is one line of a diff.
     */
    export function set(text: string | null, catalogId: string, key: string, comment: string): string {
        const file = read(text);
        const comments = { ...file.catalogs[catalogId] };

        if (comment.length > 0) {
            comments[key] = comment;
        } else {
            delete comments[key];
        }

        if (Object.keys(comments).length > 0) {
            file.catalogs[catalogId] = comments;
        } else {
            delete file.catalogs[catalogId];
        }

        return write(file);
    }

    /**
     * Reads the text of a comments file.
     *
     * @private
     * @throws Error when the file does not have the shape of a comments file.
     */
    function read(text: string | null): ICommentsFile {
        if (text === null || text.trim().length === 0) {
            return { schemaVersion: SCHEMA_VERSION, catalogs: {} };
        }

        const parsed = JSON.parse(text) as Partial<ICommentsFile> | null;

        if (!isCommentsFile(parsed)) {
            throw new Error(`${COMMENTS_FILE_NAME} does not hold comments by catalog and key.`);
        }

        return { schemaVersion: SCHEMA_VERSION, catalogs: parsed.catalogs };
    }

    /**
     * @private
     */
    function isCommentsFile(value: Partial<ICommentsFile> | null): value is ICommentsFile {
        const catalogs = value?.catalogs;

        return typeof catalogs === 'object' && catalogs !== null && !Array.isArray(catalogs) &&
            Object.values(catalogs).every((comments) => typeof comments === 'object' && comments !== null && Object.values(comments).every((comment) => typeof comment === 'string'));
    }

    /**
     * @private
     */
    function write(file: ICommentsFile): string {
        const sorted = (record: Readonly<Record<string, unknown>>): Array<[string, unknown]> => Object.entries(record).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        const catalogs = Object.fromEntries(sorted(file.catalogs).map(([id, comments]) => [id, Object.fromEntries(sorted(comments as Record<string, string>))]));

        return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, catalogs }, null, 2)}\n`;
    }

}
