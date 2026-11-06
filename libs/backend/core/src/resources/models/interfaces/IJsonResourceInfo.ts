// #region Imports

import type { JSONObject } from '@pixel-brewery/utilities';
import type { IResourceInfo } from './IResourceInfo';
import type { ResourceType } from './ResourceType';

// #endregion

/**
 * The `IJsonResourceInfo` interface represents a json resource.
 *
 * @public
 */
export interface IJsonResourceInfo extends IResourceInfo<JSONObject> {
  // #region Properties

  readonly type: typeof ResourceType.Json;

  // #endregion
}
