// #region Imports

import type { IResxEntry } from '@pixel-brewery/utilities';
import type { IResourceInfo } from './IResourceInfo';
import type { ResourceType } from './ResourceType';

// #endregion

/**
 * The `IResxResourceInfo` interface represents a resx resource.
 *
 * @public
 */
export interface IResxResourceInfo extends IResourceInfo<Array<IResxEntry>> {
  // #region Properties

  readonly type: typeof ResourceType.Resx;

  // #endregion
}
