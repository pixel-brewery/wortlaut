// #region Imports

import type { IResourceInfo } from '../../models/interfaces/IResourceInfo';

// #endregion

/**
 * Represents the `IResourceTransformerResult` interface.
 *
 * @public
 */
export interface IResourceTransformerResult {

    // #region Properties

    originalResource: IResourceInfo;

    transformedResource: IResourceInfo;

    // #endregion

}
