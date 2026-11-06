// #region Imports

import { bold, gray, Path, type IFileSystem, type ILogger } from '@pixel-brewery/utilities';
import type { IResxResourceInfo } from '../../models/interfaces/IResxResourceInfo';
import { ResourceType } from '../../models/interfaces/ResourceType';
import { ResxResourceInfo } from '../../models/ResxResourceInfo';
import type { IResourceReaderAdapter } from './interfaces/IResourceReaderAdapter';

// #endregion

/**
 * A resource reader adapter that scans directories for resx files.
 *
 * @public
 */
export class ResxResourceReaderAdapter implements IResourceReaderAdapter {
  // #region Fields

  private readonly _fileSystem: IFileSystem;
  private readonly _logger: ILogger;
  private readonly _glob: string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ResxResourceReaderAdapter` class.
   *
   * @public
   */
  public constructor(fileSystem: IFileSystem, logger: ILogger) {
    this._fileSystem = fileSystem;
    this._logger = logger;
    this._glob = '**/*.resx';
  }

  // #endregion

  // #region Methods

  /**
   * Scans the specified directory for .resx files.
   *
   * @public
   * @param path The path or paths to scan.
   * @returns The resource information.
   */
  public scanDirectory(path: string | Array<string>): Array<IResxResourceInfo> {
    this.invalidateDirectory(path);

    const result = new Array<IResxResourceInfo>();
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
  public scanFile(path: string): IResxResourceInfo | null {
    this.invalidateFile(path);

    const resx = this._fileSystem.fileReadAllResx(path);

    if (resx.length === 0) {
      this._logger.warn(`The file ${gray(path)} does not contain any resources.`);
      return null;
    }

    this._logger.log(
      `  Found ${bold(resx.length.toString())} keys in language ${bold(this._fileSystem.fileGetLocale(path))}`,
    );

    return new ResxResourceInfo({
      type: ResourceType.Resx,
      content: () => resx,
      locale: this._fileSystem.fileGetLocale(path),
      name: this._fileSystem.pathGetFileName(path),
      path: path,
    });
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

    if (!path.endsWith('.resx')) {
      throw new Error('The path should end with .resx.');
    }
  }

  // #endregion
}
