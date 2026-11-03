// #region Imports

import type { IJsonResourceInfo } from '../../models/interfaces/IJsonResourceInfo';
import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import { BaseResourceTransformerAdapter } from './abstracts/BaseResourceTransformerAdapter';

// #endregion

/**
 * Class to transform json resources.
 *
 * @public
 */
export class JsonResourceTransformerAdapter extends BaseResourceTransformerAdapter<IJsonResourceInfo> {

    // #region Methods

    /**
     * Transforms the given resource into an array of transform models, one per entry in document order. Nested objects
     * are flattened exactly as the resource flattens them for the analysis.
     *
     * @public
     * @param resource The resource to transform.
     * @returns The transformed resource.
     * @throws Error if the resource defines a key more than once.
     */
    public transform(resource: IJsonResourceInfo): Array<IResourceModel> {
        return resource.entries().map(([key, value]) => ({
            key,
            value,
            comment: ''
        }));
    }

    // #endregion

}
