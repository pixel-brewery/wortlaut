// #region Imports

import type { IPoResourceInfo } from '../../models/interfaces/IPoResourceInfo';
import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import { PoResourceInfo } from '../../models/PoResourceInfo';
import { PoText } from '../../text/PoText';
import type { IResourceSerializer } from './interfaces/IResourceSerializer';

// #endregion

/**
 * A class responsible for serializing an array of transform models into a po resource format.
 *
 * @public
 */
export class PoResourceSerializer implements IResourceSerializer<IPoResourceInfo> {
  // #region Methods

  /**
   * Serializes an array of transform models into a ResX resource.
   *
   * @public
   * @param models The array of transform models to serialize.
   * @param info The resource info.
   * @returns An instance of `IPoResourceInfo` representing the serialized data.
   */
  public serialize(
    models: Array<IResourceModel>,
    info: Pick<IPoResourceInfo, 'name' | 'path' | 'locale'>,
  ): IPoResourceInfo {
    const output: Array<IResourceModel> = [];

    models.forEach((model) => {
      output.push(model);
    });

    return new PoResourceInfo({
      name: info.name,
      path: info.path,
      locale: info.locale,
      content: () => [
        { msgid: '', msgstr: PoText.header(info.locale) },
        ...output.map((entry) => ({
          msgid: entry.key,
          msgstr: entry.value,
          comments: entry.comment,
        })),
      ],
    });
  }

  // #endregion
}
