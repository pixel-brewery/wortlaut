// #region Imports

import { bold, gray, Path, type IFileSystem, type ILogger } from '@pixel-brewery/utilities';
import type { IJsonResourceInfo } from '../../models/interfaces/IJsonResourceInfo';
import { ResourceType } from '../../models/interfaces/ResourceType';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import { COMMENTS_FILE_NAME } from '../../comments/CatalogComments';
import type { IResourceReaderAdapter } from './interfaces/IResourceReaderAdapter';

// #endregion

/**
 * A resource reader adapter that scans directories for JSON files.
 *
 * @public
 */
export class JsonResourceReaderAdapter implements IResourceReaderAdapter {
  // #region Fields

  private readonly _fileSystem: IFileSystem;
  private readonly _logger: ILogger;
  private readonly _glob: string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `JsonResourceReaderAdapter` class.
   *
   * @public
   */
  public constructor(fileSystem: IFileSystem, logger: ILogger) {
    this._fileSystem = fileSystem;
    this._logger = logger;
    this._glob = '**/*.json';
  }

  // #endregion

  // #region Methods

  /**
   * Scans the specified directory for .json files.
   *
   * @public
   * @param path The path or paths to scan.
   * @returns The resource information.
   */
  public scanDirectory(path: string | Array<string>): Array<IJsonResourceInfo> {
    this.invalidateDirectory(path);

    const result = new Array<IJsonResourceInfo>();
    const paths = Array.isArray(path) ? path : [path];

    for (const p of paths) {
      const globPath = Path.combine(p, this._glob);
      this._logger.info(`  Scanning ${gray(globPath)}`);

      const files = this._fileSystem.fileGlob(globPath);

      for (const file of files) {
        const resourceInfo = this.scanFile(file);
        if (resourceInfo) {
          result.push(resourceInfo);
        }
      }
    }

    return result;
  }

  /**
   * Scans a specific file for resource information.
   *
   * @public
   * @param path The path to the file to scan.
   * @returns The resource information or null if the file is not a valid resource.
   */
  public scanFile(path: string): IJsonResourceInfo | null {
    this.invalidateFile(path);

    // The comments of a JSON project are no catalog, even with a resource root at the root of the repository.
    if (this._fileSystem.pathGetFileName(path) === COMMENTS_FILE_NAME) {
      return null;
    }

    const json = this._fileSystem.fileReadAllJson(path);

    if (Object.keys(json).length === 0) {
      this._logger.warn(`The file ${gray(path)} does not contain any valid JSON data.`);
      return null;
    }

    const resource = new JsonResourceInfo({
      type: ResourceType.Json,
      content: () => json,
      locale: this._fileSystem.fileGetLocale(path),
      name: this._fileSystem.pathGetFileName(path),
      path: path,
    });

    // Counting the flattened keys also rejects an ambiguous resource while it is read.
    this._logger.info(
      `  Found ${bold(resource.keys().length.toString())} keys in language ${bold(resource.locale)}`,
    );

    return resource;
  }

  /**
   * @private
   */
  private invalidateDirectory(path: string | Array<string>): void {
    for (const p of Array.isArray(path) ? path : [path]) {
      if (this._fileSystem.isFileOrDirectory(p) !== 'directory') {
        throw new Error(`The path ${gray(p)} is not a valid directory.`);
      }

      if (!this._fileSystem.fileExists(p)) {
        throw new Error(`The path ${gray(p)} does not exist.`);
      }

      if (this._fileSystem.fileGlob(p).length === 0) {
        throw new Error(`The path ${gray(p)} is empty or does not contain any files.`);
      }

      if (p.endsWith(this._glob)) {
        throw new Error(`The path ${gray(p)} should not end with ${gray(this._glob)}.`);
      }
    }
  }

  /**
   * @private
   */
  private invalidateFile(path: string): void {
    if (this._fileSystem.isFileOrDirectory(path) !== 'file') {
      throw new Error(`The path ${gray(path)} is not a valid file.`);
    }

    if (!this._fileSystem.fileExists(path)) {
      throw new Error(`The path ${gray(path)} does not exist.`);
    }

    if (!this._fileSystem.fileGlob(path).length) {
      throw new Error(`The path ${gray(path)} does not contain any files.`);
    }

    if (!path.endsWith('.json')) {
      throw new Error('The path should end with .json.');
    }
  }

  // #endregion
}
