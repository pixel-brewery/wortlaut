// #region Imports

import { readFileSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { COMMENTS_FILE_NAME, ResourceReader, type IResourceInfo, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import { QUIET_LOGGER } from '../io/QuietLogger.js';

// #endregion

/**
 * The name of a catalog file: a name, a locale and a format, such as `lang.de.json`. A file without a locale segment is
 * no sign of a catalog, because every JSON file of a repository would look like one.
 */
const CATALOG_FILE = /^.+\.[A-Za-z0-9_-]+\.(json|resx|po)$/;

/**
 * The biggest catalog file that a scan reads.
 */
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;

/**
 * The formats in the order a folder that holds several of them is read in, since the others are usually generated.
 */
const FORMAT_ORDER: ReadonlyArray<ResourceMode> = ['json', 'resx', 'po'];

/**
 * A folder of catalog files of one format.
 *
 * @internal
 */
export interface ICatalogFolder {
    folder: string;
    format: ResourceMode;
    resources: Array<IResourceInfo>;
}

/**
 * Finds the catalogs among the files of a repository. It decides by the file name and, for JSON, by the content: a file
 * such as `tsconfig.lib.json` holds settings and not texts.
 *
 * @internal
 */
export class CatalogScanner {

    // #region Fields

    private readonly _fileSystem: IFileSystem;
    private readonly _reader: ResourceReader;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `CatalogScanner` class.
     *
     * @param fileSystem The file system.
     */
    public constructor(fileSystem: IFileSystem) {
        this._fileSystem = fileSystem;
        this._reader = new ResourceReader(QUIET_LOGGER, fileSystem);
    }

    // #endregion

    // #region Methods

    /**
     * Finds the catalog folders among files.
     *
     * @param files The absolute paths of the files.
     * @returns The folders that hold catalogs, each with the format most of its files have.
     */
    public scan(files: ReadonlyArray<string>): Array<ICatalogFolder> {
        const byFolder = new Map<string, Map<ResourceMode, Array<IResourceInfo>>>();

        for (const file of files) {
            const resource = this.readCatalog(file);

            if (resource) {
                const formats = byFolder.get(dirname(file)) ?? new Map<ResourceMode, Array<IResourceInfo>>();

                formats.set(resource.type as ResourceMode, [...formats.get(resource.type as ResourceMode) ?? [], resource]);
                byFolder.set(dirname(file), formats);
            }
        }

        return Array.from(byFolder.entries())
            .map(([folder, formats]) => {
                const format = FORMAT_ORDER.reduce((best, candidate) => (formats.get(candidate)?.length ?? 0) > (formats.get(best)?.length ?? 0) ? candidate : best);

                return { folder, format, resources: formats.get(format) ?? [] };
            })
            .sort((a, b) => a.folder.localeCompare(b.folder));
    }

    /**
     * @private
     */
    private readCatalog(file: string): IResourceInfo | null {
        const name = basename(file);
        const match = CATALOG_FILE.exec(name);

        if (!match || name === COMMENTS_FILE_NAME || !this._fileSystem.fileGetLocale(name, '')) {
            return null;
        }

        try {
            if (statSync(file).size > MAX_CATALOG_BYTES) {
                return null;
            }

            if (match[1] === 'json' && !this.isStringTree(JSON.parse(readFileSync(file, 'utf8')))) {
                return null;
            }

            const resource = this._reader.scanFile(file, match[1] as ResourceMode);

            return resource && resource.keys().length > 0 ? resource : null;
        } catch {
            // A file that cannot be read as a catalog is simply no catalog.
            return null;
        }
    }

    /**
     * @private
     */
    private isStringTree(value: unknown): boolean {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }

        return Object.values(value).every((item) => typeof item === 'string' || this.isStringTree(item));
    }

    // #endregion

}
