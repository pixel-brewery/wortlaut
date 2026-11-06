// #region Imports

import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import type { IResxResourceInfo } from '../../models/interfaces/IResxResourceInfo';
import { ResxResourceInfo } from '../../models/ResxResourceInfo';
import type { IResourceSerializer } from './interfaces/IResourceSerializer';

// #endregion

/**
 * A class responsible for serializing an array of transform models into a ResX resource format.
 *
 * @public
 */
export class ResxResourceSerializer implements IResourceSerializer<IResxResourceInfo> {
  // #region Methods

  /**
   * Serializes an array of transform models into a ResX resource.
   *
   * @public
   * @param models The array of transform models to serialize.
   * @param info The resource info.
   * @returns An instance of `IResxResourceInfo` representing the serialized data.
   */
  public serialize(
    models: Array<IResourceModel>,
    info: Pick<IResxResourceInfo, 'name' | 'path' | 'locale'>,
  ): IResxResourceInfo {
    const output: Array<IResourceModel> = [];

    models.forEach((model) => {
      output.push(model);
    });

    return new ResxResourceInfo({
      name: info.name,
      path: info.path,
      locale: info.locale,
      content: () => output,
    });
  }

  // #endregion
}
