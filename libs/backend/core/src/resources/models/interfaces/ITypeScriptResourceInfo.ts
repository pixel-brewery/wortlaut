// #region Imports

import type { IResourceInfo } from './IResourceInfo';
import type { ResourceType } from './ResourceType';

// #endregion

/**
 * The `ITypeScriptResourceInfo` interface represents a typescript resource.
 *
 * @public
 */
export interface ITypeScriptResourceInfo extends IResourceInfo<Record<string, string>> {

    // #region Properties

    readonly type: typeof ResourceType.TypeScript;

    // #endregion

}
