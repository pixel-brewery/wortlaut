// #region Imports

import type { IResourceInfo } from '../../../models/interfaces/IResourceInfo';
import type { IResourceModel } from '../../../models/interfaces/IResourceModel';

// #endregion

/**
 * Interface for resource serializers.
 */
export interface IResourceSerializer<T extends IResourceInfo> {

    // #region Methods

    serialize(models: Array<IResourceModel>, info: Pick<T, 'name' | 'path' | 'locale'>): T;

    // #endregion

}
