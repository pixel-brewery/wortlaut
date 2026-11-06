/**
 * `ResourceType` Enum which describes possible options.
 */
export const ResourceType = {
  /**
   * `json` Represents a json resource.
   */
  Json: 'json',

  /**
   * `resx` Represents a resx resource.
   */
  Resx: 'resx',

  /**
   * `ts` Represents a typescript resource.
   */
  TypeScript: 'ts',

  /**
   * `po` Represents a po resource.
   */
  Po: 'po',
} as const;

/**
 * `ResourceType` Type which describes possible options.
 */
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

/**
 * Gets the resource type from a file path.
 *
 * @param filePath The file path.
 * @returns The resource type.
 *
 * @throws Error if the resource type is not supported.
 */
export function resourceTypeFormFile(filePath: string): ResourceType {
  if (filePath.endsWith('.json')) {
    return ResourceType.Json;
  }

  if (filePath.endsWith('.resx')) {
    return ResourceType.Resx;
  }

  if (filePath.endsWith('.ts')) {
    return ResourceType.TypeScript;
  }

  if (filePath.endsWith('.po')) {
    return ResourceType.Po;
  }

  throw new Error(`Resource type not supported: ${filePath}`);
}
