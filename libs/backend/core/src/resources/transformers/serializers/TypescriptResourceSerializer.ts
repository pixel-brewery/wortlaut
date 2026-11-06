// #region Imports

import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import type { ITypeScriptResourceInfo } from '../../models/interfaces/ITypeScriptResourceInfo';
import { TypeScriptResourceInfo } from '../../models/TypeScriptResourceInfo';
import type { IResourceSerializer } from './interfaces/IResourceSerializer';

// #endregion

/**
 * A class responsible for serializing an array of transform models into a TypeScript resource format.
 *
 * @public
 */
export class TypescriptResourceSerializer implements IResourceSerializer<ITypeScriptResourceInfo> {
  // #region Methods

  /**
   * Serializes an array of transform models into a TypeScript resource.
   *
   * @public
   * @param models The array of transform models to serialize.
   * @param info The resource info.
   * @returns An instance of `ITypeScriptResourceInfo` representing the serialized data.
   */
  public serialize(
    models: Array<IResourceModel>,
    info: Pick<ITypeScriptResourceInfo, 'name' | 'path' | 'locale'>,
  ): ITypeScriptResourceInfo {
    // Keys are text from a catalog, and `__proto__` has to stay a key like any other.
    const output = Object.create(null) as Record<string, string>;

    models.forEach((model) => {
      output[model.key] = model.value;
    });

    return new TypeScriptResourceInfo({
      name: info.name,
      path: info.path,
      locale: info.locale,
      content: () => output,
    });
  }

  // #endregion
}
