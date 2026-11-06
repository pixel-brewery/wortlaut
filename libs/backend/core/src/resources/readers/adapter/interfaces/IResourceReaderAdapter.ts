// #region Imports

import type { IResourceInfo } from '../../../models/interfaces/IResourceInfo';

// #endregion

/**
 * The `IResourceReaderAdapter` interface defines the methods for scanning directories and files
 * for resource information. It is used to adapt different resource scanning implementations.
 *
 * @public
 */
export interface IResourceReaderAdapter {
  // #region Methods

  /**
   * Scans the specified directory for resource files and returns an array of resource information.
   *
   * @public
   * @param path The path or paths to scan.
   * @returns The resource information.
   */
  scanDirectory(path: string | Array<string>): Array<IResourceInfo>;

  /**
   * Scans a specific file for resource information.
   *
   * @public
   * @param path The path to the file to scan.
   * @returns The resource information or null if the file is not a valid resource.
   */
  scanFile(path: string): IResourceInfo | null;

  // #endregion
}
