// #region Imports

import { ResourceType } from '../resources/models/interfaces/ResourceType.js';
import type { IFormatter } from './interfaces/IFormatter.js';
import { JsonFormatter } from './JSONFormatter.js';
import { PoFormatter } from './POFormatter.js';
import { ResxFormatter } from './RESXFormatter.js';

// #endregion

/**
 * @public
 */
export namespace Formatters {
  /**
   * Gets a formatter instance based on the provided formatter type.
   *
   * @param type The formatter type.
   * @returns The formatter instance.
   */
  export function get(type: ResourceType): IFormatter {
    switch (type) {
      case ResourceType.Json:
        return new JsonFormatter();
      case ResourceType.Resx:
        return new ResxFormatter();
      case ResourceType.Po:
        return new PoFormatter();
      case ResourceType.TypeScript:
        throw new Error('TypeScript formatter is not implemented');
      default:
        throw new Error('Unknown formatter');
    }
  }
}
