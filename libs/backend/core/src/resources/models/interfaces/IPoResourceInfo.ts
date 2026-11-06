// #region Imports

import type { IPoEntry } from '@pixel-brewery/utilities';
import type { IResourceInfo } from './IResourceInfo';
import type { ResourceType } from './ResourceType';

// #endregion

/**
 * The `IPoResourceInfo` interface represents a po resource.
 *
 * @public
 */
export interface IPoResourceInfo extends IResourceInfo<Array<IPoEntry>> {
  // #region Properties

  readonly type: typeof ResourceType.Po;

  // #endregion
}
