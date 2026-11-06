// #region Imports

import type { IResxEntry } from '@pixel-brewery/utilities';
import type { ResourceContentFn } from './interfaces/IResourceInfo';
import type { IResxResourceInfo } from './interfaces/IResxResourceInfo';
import { ResourceType } from './interfaces/ResourceType';
import { ResxText } from '../text/ResxText';

// #endregion

/**
 * Represents a resx resource.
 *
 * @public
 */
export class ResxResourceInfo implements IResxResourceInfo {
  // #region Fields

  private readonly _name: string;
  private readonly _path: string;
  private readonly _language: string;
  private readonly _type: typeof ResourceType.Resx;
  private readonly _content: ResourceContentFn<Array<IResxEntry>>;
  private _cacheContent: Array<IResxEntry> | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ResxResourceInfo` class.
   *
   * @param resource The resource information.
   * @public
   */
  public constructor(resource: Partial<IResxResourceInfo> = {}) {
    this._name = resource.name ?? '';
    this._path = resource.path ?? '';
    this._language = resource.locale ?? '';
    this._type = ResourceType.Resx;
    this._cacheContent = null;
    this._content = (): Array<IResxEntry> => {
      if (!this._cacheContent) {
        const c = resource.content ?? (() => []);
        return (this._cacheContent = c());
      }

      return this._cacheContent;
    };
  }

  // #endregion

  // #region Properties

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get path(): string {
    return this._path;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get locale(): string {
    return this._language;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get type(): typeof ResourceType.Resx {
    return this._type;
  }

  /**
   * Gets the `content` property.
   *
   * @public
   * @readonly
   */
  public get content(): ResourceContentFn<Array<IResxEntry>> {
    return this._content;
  }

  /**
   * Gets the `isVirtual` property.
   *
   * @public
   * @readonly
   */
  public get isVirtual(): boolean {
    return this._path === '' || this._name === '';
  }

  // #endregion

  // #region Methods

  /**
   * Gets the keys of the resource.
   *
   * @public
   */
  public keys(): Array<string> {
    const content = this._content();

    return content.map((entry) => entry.key);
  }

  /**
   * Gets the values of the resource.
   *
   * @public
   */
  public values(): Array<string> {
    const content = this._content();

    return content.map((entry) => entry.value);
  }

  /**
   * Gets the entries of the resource.
   *
   * @public
   */
  public entries(): Array<[string, string]> {
    const content = this._content();

    return content.map((entry) => [entry.key, entry.value] as [string, string]);
  }

  /**
   * Clones the current instance.
   *
   * @public
   */
  public clone(): this {
    return this.copy(this);
  }

  /**
   * Copies the current instance.
   *
   * @public
   */
  public copy(
    resource: Pick<
      IResxResourceInfo,
      'name' | 'path' | 'locale' | 'type' | 'content' | 'isVirtual'
    >,
  ): this {
    return new ResxResourceInfo(resource) as this;
  }

  /**
   * Sorts the resource data.
   *
   * @public
   * @param order The order to sort the data.
   */
  public sort(order: 'asc' | 'desc'): this {
    const content = this._content();
    const sortedContent = content.sort((a, b) => {
      const comparison = a.key.localeCompare(b.key);
      return order === 'asc' ? comparison : -comparison;
    });

    this._cacheContent = sortedContent;

    return this;
  }

  /**
   * Converts the resource to a string.
   *
   * @public
   */
  public toString(): string {
    return ResxText.serialize(this._content());
  }

  // #endregion
}
