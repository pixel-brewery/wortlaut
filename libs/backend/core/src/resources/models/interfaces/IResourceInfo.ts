// #region Imports

import type { ResourceType } from './ResourceType';

// #endregion

/**
 * Type for resource content function
 *
 * @public
 */
export type ResourceContentFn<TContent = unknown> = () => TContent;

/**
 * Interface for resource info
 *
 * @public
 */
export interface IResourceInfo<TContent = unknown> {
  // #region Properties

  /**
   * The name of the resource
   */
  readonly name: string;

  /**
   * The path of the resource
   */
  readonly path: string;

  /**
   * The locale of the resource
   */
  readonly locale: string;

  /**
   * The type of the resource
   */
  readonly type: ResourceType | string;

  /**
   * The data of the resource
   */
  readonly content: ResourceContentFn<TContent>;

  /**
   * The flag to indicate if the resource is virtual
   */
  readonly isVirtual: boolean;

  // #endregion

  // #region Methods

  /**
   * Get the keys of the resource
   */
  keys(): Array<string>;

  /**
   * Get the values of the resource
   */
  values(): Array<string>;

  /**
   * Get the entries of the resource
   */
  entries(): Array<[string, string]>;

  /**
   * Clone the resource
   */
  clone(): this;

  /**
   * Copy the resource
   *
   * @param resource The resource to copy
   */
  copy(
    resource: Pick<IResourceInfo, 'name' | 'path' | 'locale' | 'type' | 'content' | 'isVirtual'>,
  ): this;

  /**
   * Sort the resource
   *
   * @param order The order to sort resources
   */
  sort(order: 'asc' | 'desc'): this;

  /**
   * Convert the resource to string
   */
  toString(): string;

  // #endregion
}
