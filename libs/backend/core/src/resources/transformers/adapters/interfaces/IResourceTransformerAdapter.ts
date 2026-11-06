// #region Imports

import type { IResourceInfo } from '../../../models/interfaces/IResourceInfo';
import type { IResourceModel } from '../../../models/interfaces/IResourceModel';

// #endregion

/**
 * Interface for resource transformers.
 *
 * @public
 */
export interface IResourceTransformerAdapter<T extends IResourceInfo> {
  // #region Methods

  transform(resource: T): Array<IResourceModel>;

  // #endregion
}
