// #region Imports

import type { IPoResourceInfo } from '../../models/interfaces/IPoResourceInfo';
import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import { BaseResourceTransformerAdapter } from './abstracts/BaseResourceTransformerAdapter';

// #endregion

/**
 * Class to transform po resources.
 *
 * @public
 */
export class PoResourceTransformerAdapter extends BaseResourceTransformerAdapter<IPoResourceInfo> {
  // #region Imports

  /**
   * Transforms the given resource into an array of transform models.
   *
   * @public
   * @param resource The resource to transform.
   * @returns The transformed resource.
   */
  public transform(resource: IPoResourceInfo): Array<IResourceModel> {
    return resource
      .content()
      .filter((entry) => entry.msgid !== '')
      .map((entry) => ({
        key: entry.msgid,
        value: entry.msgstr,
        comment: entry.comments ?? '',
      }));
  }

  // #endregion
}
