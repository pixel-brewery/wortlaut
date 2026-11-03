// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import type { IResourceInfo } from '../models/interfaces/IResourceInfo';
import type { IResourceModel } from '../models/interfaces/IResourceModel';
import { ResourceType } from '../models/interfaces/ResourceType';
import { TypeScriptResourceInfo } from '../models/TypeScriptResourceInfo';
import type { IResourceTransformerAdapter } from './adapters/interfaces/IResourceTransformerAdapter';
import { JsonResourceTransformerAdapter } from './adapters/JsonResourceTransformerAdapter';
import { PoResourceTransformerAdapter } from './adapters/PoResourceTransformerAdapter';
import { ResxResourceTransformerAdapter } from './adapters/ResxResourceTransformerAdapter';
import type { IResourceSerializer } from './serializers/interfaces/IResourceSerializer';
import { JsonResourceSerializer } from './serializers/JsonResourceSerializer';
import { PoResourceSerializer } from './serializers/PoResourceSerializer';
import { ResxResourceSerializer } from './serializers/ResxResourceSerializer';
import { TypescriptResourceSerializer } from './serializers/TypescriptResourceSerializer';

// #endregion

/**
 * Handles the transformation of resources by applying adapters and serializers dynamically.
 *
 * @public
 */
export class ResourceTransformer {

    // #region Fields

    private readonly _logger: ILogger;
    private readonly _adapters: Map<ResourceType | string, IResourceTransformerAdapter<IResourceInfo>>;
    private readonly _serializers: Map<ResourceType | string, IResourceSerializer<IResourceInfo>>;

    // #endregion

    // #region Constructor

    /**
     * Constructs a new instance of the `ResourceTransformer` class.
     *
     * @public
     */
    public constructor(logger: ILogger) {
        this._logger = logger;

        this._adapters = new Map()
            .set(ResourceType.Json, new JsonResourceTransformerAdapter())
            .set(ResourceType.Resx, new ResxResourceTransformerAdapter())
            .set(ResourceType.Po, new PoResourceTransformerAdapter());

        this._serializers = new Map()
            .set(ResourceType.Json, new JsonResourceSerializer())
            .set(ResourceType.Resx, new ResxResourceSerializer())
            .set(ResourceType.TypeScript, new TypescriptResourceSerializer())
            .set(ResourceType.Po, new PoResourceSerializer());
    }

    // #endregion

    // #region Methods

    /**
     * Registers a transformer adapter for a specific resource type.
     *
     * @public
     * @param resourceType The type of resource the adapter handles.
     * @param adapter The adapter to register.
     */
    public registerAdapter(resourceType: ResourceType | string, adapter: IResourceTransformerAdapter<IResourceInfo>): void {
        this._adapters.set(resourceType, adapter);
    }

    /**
     * Unregister a transformer adapter for a specific resource type.
     *
     * @public
     * @param resourceType The type of resource to unregister.
     */
    public unregisterAdapter(resourceType: ResourceType | string): void {
        this._adapters.delete(resourceType);
    }

    /**
     * Register a serializer for a specific resource type.
     *
     * @public
     * @param resourceType The type of resource the serializer handles.
     * @param serializer The serializer to register.
     */
    public registerSerializer(resourceType: ResourceType | string, serializer: IResourceSerializer<IResourceInfo>): void {
        this._serializers.set(resourceType, serializer);
    }

    /**
     * Unregister a serializer for a specific resource type.
     *
     * @public
     * @param resourceType The type of resource to unregister.
     */
    public unregisterSerializer(resourceType: ResourceType | string): void {
        this._serializers.delete(resourceType);
    }

    /**
     * Transforms a resource info object into a collection of transform models.
     *
     * @public
     * @param resource The resource to transform.
     * @returns The transformed models.
     * @throws Error if no adapter is registered for the resource type
     */
    public transform(resource: IResourceInfo): Array<IResourceModel> {
        const adapter = this._adapters.get(resource.type);

        if (!adapter) {
            throw new Error(`[ResourceTransformer]: No adapter registered for resource type: ${resource.type}`);
        }

        return adapter.transform(resource);
    }

    /**
     * Serializes a collection of transform models into a resource info object.
     *
     * @public
     * @param models The models to serialize.
     * @param meta The resource metadata.
     * @returns The serialized resource info.
     * @throws Error if no serializer is registered for the target resource
     */
    public serialize(models: Array<IResourceModel>, meta: Pick<IResourceInfo, 'name' | 'path' | 'locale'> & { target: ResourceType | string }): IResourceInfo {
        const serializer = this._serializers.get(meta.target);

        if (!serializer) {
            throw new Error(`[ResourceTransformer]: No serializer registered for target resource type: ${meta.target}`);
        }

        try {
            return serializer.serialize(models, meta);
        } catch (error) {
            throw new Error(`[ResourceTransformer]: Failed to serialize resource: ${error.message}`);
        }
    }

    /**
     * Returns whether the existing content of a target file already holds the serialized resource, so writing it again
     * would not change anything. A TypeScript resource compares its keys, values and their order and ignores formatting;
     * any other resource compares its text.
     *
     * @public
     * @param resource The serialized resource.
     * @param existingContent The current content of the target file.
     * @returns `true` when the target file does not need to be written.
     */
    public isUpToDate(resource: IResourceInfo, existingContent: string): boolean {
        return resource instanceof TypeScriptResourceInfo
            ? resource.isUpToDate(existingContent)
            : resource.toString() === existingContent;
    }

    // #endregion

}
