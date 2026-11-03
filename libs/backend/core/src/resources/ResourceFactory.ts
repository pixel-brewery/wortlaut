// #region Imports

import { type IFileSystem, Json, Po, Resx } from '@pixel-brewery/utilities';
import { PoResourceInfo } from '../Index';
import { ResxResourceInfo } from '../resources/models/ResxResourceInfo';
import type { IResourceInfo } from './models/interfaces/IResourceInfo';
import { ResourceType, resourceTypeFormFile } from './models/interfaces/ResourceType';
import { JsonResourceInfo } from './models/JsonResourceInfo';

// #endregion

/**
 * The `Name` class.
 *
 * @public
 */
export class ResourceFactory {

    // #region Fields

    private readonly _fileSystem: IFileSystem;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ResourceFactory` class.
     *
     * @public
     */
    public constructor(fileSystem: IFileSystem) {
        this._fileSystem = fileSystem;
    }

    // #endregion

    // #region Methods

    /**
     * Gets a resource from a path.
     *
     * @public
     * @param filePath e path of the resource.
     * @returns The resource
     * @throws Error if the file does not exist
     */
    public getResourceFromPath(filePath: string): IResourceInfo {
        if (!this._fileSystem.fileExists(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const resourceType = resourceTypeFormFile(filePath);

        switch (resourceType) {
            case ResourceType.Json:
                return new JsonResourceInfo({
                    type: ResourceType.Json,
                    content: () => this._fileSystem.fileReadAllJson(filePath),
                    locale: this._fileSystem.fileGetLocale(filePath),
                    name: this._fileSystem.pathGetFileName(filePath),
                    path: filePath
                });
            case ResourceType.Resx:
                return new ResxResourceInfo({
                    type: ResourceType.Resx,
                    content: () => this._fileSystem.fileReadAllResx(filePath),
                    locale: this._fileSystem.fileGetLocale(filePath),
                    name: this._fileSystem.pathGetFileName(filePath)
                });
            case ResourceType.Po:
                return new PoResourceInfo({
                    type: ResourceType.Po,
                    content: () => this._fileSystem.fileReadAllPo(filePath),
                    locale: this._fileSystem.fileGetLocale(filePath),
                    name: this._fileSystem.pathGetFileName(filePath),
                    path: filePath
                });
            case ResourceType.TypeScript:
            default:
                throw new Error(`Resource type not supported: ${resourceType}`);
        }
    }

    /**
     * Creates a resource from content.
     *
     * @public
     * @param content The content of the resource.
     * @param type The type of the resource.
     * @param locale The locale of the resource.
     * @param name The name of the resource.
     * @returns The resource
     * @throws Error if the resource type is not supported
     */
    public createResourceFromContent(content: string, type: ResourceType, locale: string): IResourceInfo {
        switch (type) {
            case ResourceType.Json:
                return new JsonResourceInfo({
                    type: ResourceType.Json,
                    content: () => {
                        const p = Json.parse(content).entries;
                        return p;
                    },
                    locale: locale
                });
            case ResourceType.Resx:
                return new ResxResourceInfo({
                    type: ResourceType.Resx,
                    content: () => {
                        const p = Resx.parse(content).entries;
                        return p;
                    },
                    locale: locale
                });
            case ResourceType.Po:
                return new PoResourceInfo({
                    type: ResourceType.Po,
                    content: () => {
                        const p = Po.parse(content).entries;
                        return p;
                    },
                    locale: locale
                });
            case ResourceType.TypeScript:
            default:
                throw new Error(`Resource type not supported: ${type}`);
        }
    }

    // #endregion

}
