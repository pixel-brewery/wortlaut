// #region Imports

import type { IResourceInfo } from '../../../models/interfaces/IResourceInfo';
import type { IResourceModel } from '../../../models/interfaces/IResourceModel';
import type { IResourceTransformerAdapter } from '../interfaces/IResourceTransformerAdapter';

// #endregion

/**
 * Abstract base class for resource transformations.
 *
 * @public
 * @abstract
 */
export abstract class BaseResourceTransformerAdapter<
  T extends IResourceInfo,
> implements IResourceTransformerAdapter<T> {
  // #region Methods

  /**
   * Transforms the given resource into an array of transform models.
   *
   * @public
   * @param resource The resource to transform.
   * @returns The transformed resource.
   */
  public abstract transform(resource: T): Array<IResourceModel>;

  // #endregion
}
