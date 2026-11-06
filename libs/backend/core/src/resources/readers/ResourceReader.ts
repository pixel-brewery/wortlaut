// #region Imports

import { bold, type IFileSystem, type ILogger, magenta, t, yellow } from '@pixel-brewery/utilities';
import type { IResourceInfo } from '../models/interfaces/IResourceInfo';
import { ResourceMode } from '../ResourceMode';
import type { IResourceReaderAdapter } from './adapter/interfaces/IResourceReaderAdapter';
import { JsonResourceReaderAdapter } from './adapter/JsonResourceReaderAdapter';
import { PoResourceReaderAdapter } from './adapter/PoResourceReaderAdapter';
import { ResxResourceReaderAdapter } from './adapter/ResxResourceReaderAdapter';

// #endregion

/**
 * The `ResourceReader` class is responsible for processing resources.
 * It can be resolves json or resx files.
 *
 * @public
 */
export class ResourceReader {
  // #region Fields

  private readonly _fileSystem: IFileSystem;
  private readonly _logger: ILogger;
  private readonly _adapters: Map<ResourceMode, IResourceReaderAdapter>;

  // #endregion

  // #region Ctor

  /**
   * Creates a new instance of `ResourceReader`.
   *
   * @public
   * @param logger The logger interface.
   * @param fileSystem The file system interface.
   */
  public constructor(logger: ILogger, fileSystem: IFileSystem) {
    this._fileSystem = fileSystem;
    this._logger = logger;
    this._adapters = new Map<ResourceMode, IResourceReaderAdapter>()
      .set(ResourceMode.Json, new JsonResourceReaderAdapter(this._fileSystem, this._logger))
      .set(ResourceMode.Resx, new ResxResourceReaderAdapter(this._fileSystem, this._logger))
      .set(ResourceMode.Po, new PoResourceReaderAdapter(this._fileSystem, this._logger));
  }

  // #endregion

  // #region Methods

  /**
   * Scans a directory for resources of the given type.
   *
   * @public
   * @param path The path or paths to scan.
   * @param type The type of resource to scan for.
   * @returns An array of resource information found in the directory.
   */
  public scanDirectory(path: string | Array<string>, type: ResourceMode): Array<IResourceInfo> {
    this._logger.log(t`${magenta(`Scanning for ${bold(type)} resources...`)}`);

    const adapter = this._adapters.get(type);

    if (!adapter) {
      throw new Error('No adapter found for the specified mode.');
    }

    const result = adapter.scanDirectory(path);

    this._logger.log(
      t`${magenta(`Scanning complete.${result.length === 0 ? yellow(' No resources found.') : ''}`)}`,
    );

    return result;
  }

  /**
   * Scans a specific file for resources of the given type.
   *
   * @public
   * @param path The path to the file to scan.
   * @param type The type of resource to scan for.
   * @returns The resource information or null if the file is not a valid resource.
   */
  public scanFile(path: string, type: ResourceMode): IResourceInfo | null {
    this._logger.log(t`${magenta(`Scanning for ${bold(type)} resource in file...`)}`);

    const adapter = this._adapters.get(type);

    if (!adapter) {
      throw new Error('No adapter found for the specified mode.');
    }

    const result = adapter.scanFile(path);

    this._logger.log(
      t`${magenta(`Scanning complete.${result ? '' : yellow(' No resource found.')}`)}`,
    );

    return result;
  }

  // #endregion
}
