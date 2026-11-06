// #region Imports

import { Json, type JSONObject, type JSONValue } from '@pixel-brewery/utilities';
import type { IJsonResourceInfo } from './interfaces/IJsonResourceInfo';
import type { ResourceContentFn } from './interfaces/IResourceInfo';
import { ResourceType } from './interfaces/ResourceType';

// #endregion

/**
 * Represents a json resource.
 *
 * @public
 */
export class JsonResourceInfo implements IJsonResourceInfo {
  // #region Fields

  private readonly _name: string;
  private readonly _path: string;
  private readonly _language: string;
  private readonly _type: typeof ResourceType.Json;
  private readonly _content: ResourceContentFn<JSONObject>;
  private _cacheContent: JSONObject | null;
  private _isContentResolved: boolean;
  private _flatSource: JSONObject | null;
  private _flatEntries: Array<[string, string]>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `JsonResourceInfo` class.
   *
   * @param resource The resource information.
   * @public
   */
  public constructor(resource: Partial<IJsonResourceInfo> = {}) {
    this._name = resource.name ?? '';
    this._path = resource.path ?? '';
    this._language = resource.locale ?? '';
    this._type = ResourceType.Json;
    this._cacheContent = null;
    this._isContentResolved = false;
    this._flatSource = null;
    this._flatEntries = [];
    this._content = (): JSONObject => {
      if (!this._isContentResolved) {
        const c = resource.content ?? (() => ({}));
        this._isContentResolved = true;
        this._cacheContent = c();

        return this._cacheContent;
      }

      return this._cacheContent ?? {};
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
  public get type(): typeof ResourceType.Json {
    return this._type;
  }

  /**
   * Gets the `data` property.
   *
   * @public
   * @readonly
   */
  public get content(): ResourceContentFn<JSONObject> {
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
   * Gets the keys of the resource data, sorted. The keys of nested objects are flattened (see `entries`).
   *
   * @public
   */
  public keys(): Array<string> {
    return this.flatten()
      .map(([key]) => key)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Gets the values of the resource data in document order. The values of nested objects are flattened (see
   * `entries`).
   *
   * @public
   */
  public values(): Array<string> {
    return this.flatten().map(([, value]) => value);
  }

  /**
   * Gets the entries of the resource data in document order.
   *
   * @remarks
   * A nested object is a level of its keys: `{ "loc": { "nav": { "label": "Menu" } } }` yields the key
   * `loc.nav.label`, exactly like the flat key `"loc.nav.label": "Menu"`. Arrays are levels too, with their indexes as
   * key segments. Numbers and booleans become their text, and `null` is an empty value. A key that the resource spells
   * more than once, flat and nested, is ambiguous and rejected with an error.
   *
   * @public
   * @throws Error if the resource defines a key more than once.
   */
  public entries(): Array<[string, string]> {
    return this.flatten().map(([key, value]) => [key, value]);
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
      IJsonResourceInfo,
      'name' | 'path' | 'locale' | 'type' | 'content' | 'isVirtual'
    >,
  ): this {
    return new JsonResourceInfo(resource) as this;
  }

  /**
   * Sorts the resource data.
   *
   * @public
   * @param order The order to sort the resource data.
   */
  public sort(order: 'asc' | 'desc'): this {
    const sortLevel = (level: JSONObject): JSONObject =>
      Object.keys(level)
        .sort((a, b) => (order === 'asc' ? a.localeCompare(b) : b.localeCompare(a)))
        .reduce((acc: JSONObject, key) => {
          const value = level[key];

          // A nested object is a level of its keys (see `entries`), so it gets sorted as well.
          acc[key] =
            value !== null && typeof value === 'object' && !Array.isArray(value)
              ? sortLevel(value as JSONObject)
              : value;

          return acc;
        }, {});

    this._cacheContent = sortLevel(this._content());

    return this;
  }

  /**
   * Converts the resource to a string.
   *
   * @public
   */
  public toString(): string {
    const content = this._content();

    return Json.from(content).toString();
  }

  /**
   * Flattens the content into its entries and caches them until the content changes.
   *
   * @private
   */
  private flatten(): Array<[string, string]> {
    const content = this._content();

    if (this._flatSource === content) {
      return this._flatEntries;
    }

    const entries = new Array<[string, string]>();
    const keys = new Set<string>();
    const duplicates = new Set<string>();
    const traverse = (value: JSONValue, key: string): void => {
      if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([segment, child]) =>
          traverse(child, key ? `${key}.${segment}` : segment),
        );
        return;
      }

      if (keys.has(key)) {
        duplicates.add(key);
      }

      keys.add(key);
      entries.push([key, value === null ? '' : String(value)]);
    };

    traverse(content, '');

    if (duplicates.size > 0) {
      const list = Array.from(duplicates)
        .map((key) => `'${key}'`)
        .join(', ');

      throw new Error(
        `The resource '${this._path || this._language}' defines the key${duplicates.size > 1 ? 's' : ''} ${list} more than once through different nesting, for example as a flat key and inside a nested object. Keep one spelling per key.`,
      );
    }

    this._flatSource = content;
    this._flatEntries = entries;

    return entries;
  }

  // #endregion
}
