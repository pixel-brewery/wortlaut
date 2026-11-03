// #region Imports

import type { IJsonResourceInfo } from '../../models/interfaces/IJsonResourceInfo';
import type { IResourceModel } from '../../models/interfaces/IResourceModel';
import { JsonResourceInfo } from '../../models/JsonResourceInfo';
import type { IResourceSerializer } from './interfaces/IResourceSerializer';

// #endregion

/**
 * A class responsible for serializing an array of transform models into a JSON resource.
 *
 * @public
 */
export class JsonResourceSerializer implements IResourceSerializer<IJsonResourceInfo> {

    // #region Methods

    /**
     * Serializes an array of transform models into a JSON resource.
     *
     * @public
     * @param models The array of transform models to serialize.
     * @param info The resource info.
     * @returns An instance of `IJsonResourceInfo` representing the serialized data.
     */
    public serialize(models: Array<IResourceModel>, info: Pick<IJsonResourceInfo, 'name' | 'path' | 'locale'>): IJsonResourceInfo {
        // Keys are text from a catalog. Without a prototype, `__proto__.x` stays a key and the walk below cannot reach `Object.prototype`.
        const output: Record<string, any> = Object.create(null);

        models.forEach((model) => {
            const keys = model.key.split('.');
            let current = output;

            keys.forEach((key, index) => {
                try {
                    if (index === keys.length - 1) {
                        current[key] = model.value;
                    } else {
                        if (current[key] !== undefined && typeof current[key] !== 'object') {
                            throw new Error(`[JsonResourceSerializer]: Cannot create nested structure - key "${keys.slice(0, index + 1).join('.')}" already exists as a primitive value "${current[key]}".`);
                        }

                        current[key] ??= Object.create(null);
                        current = current[key];
                    }
                } catch (error) {
                    throw new Error(`[JsonResourceSerializer]: Failed to serialize model with key "${model.key}": ${error.message}`);
                }
            });
        });

        return new JsonResourceInfo({
            name: info.name,
            path: info.path,
            locale: info.locale,
            content: () => output
        });
    }

    // #endregion

}
