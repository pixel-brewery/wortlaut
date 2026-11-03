// #region Imports

import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import type { IResxResourceInfo } from '../../models/interfaces/IResxResourceInfo';
import { BaseResourceTransformerAdapter } from './abstracts/BaseResourceTransformerAdapter';

// #endregion

/**
 * Class to transform resx resources.
 *
 * @public
 */
export class ResxResourceTransformerAdapter extends BaseResourceTransformerAdapter<IResxResourceInfo> {

    // #region Imports

    /**
     * Transforms the given resource into an array of transform models.
     *
     * @public
     * @param resource The resource to transform.
     * @returns The transformed resource.
     */
    public transform(resource: IResxResourceInfo): Array<IResourceModel> {
        return resource.content().map((entry) => ({
            key: entry.key,
            value: entry.value,
            comment: entry.comment
        }));
    }

    // #endregion

}
