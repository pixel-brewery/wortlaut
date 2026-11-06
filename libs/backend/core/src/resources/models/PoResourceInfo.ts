// #region Imports

import type { IPoEntry } from '@pixel-brewery/utilities';
import type { IPoResourceInfo } from './interfaces/IPoResourceInfo';
import type { ResourceContentFn } from './interfaces/IResourceInfo';
import { ResourceType } from './interfaces/ResourceType';
import { PoText } from '../text/PoText';

// #endregion

/**
 * Represents a po resource.
 *
 * @public
 */
export class PoResourceInfo implements IPoResourceInfo {
  // #region Fields

  private readonly _name: string;
  private readonly _path: string;
  private readonly _language: string;
  private readonly _type: typeof ResourceType.Po;
  private readonly _content: ResourceContentFn<Array<IPoEntry>>;
  private _cacheContent: Array<IPoEntry> | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `PoResourceInfo` class.
   *
   * @param resource The resource information.
   * @public
   */
  public constructor(resource: Partial<IPoResourceInfo> = {}) {
    this._name = resource.name ?? '';
    this._path = resource.path ?? '';
    this._language = resource.locale ?? '';
    this._type = ResourceType.Po;
    this._cacheContent = null;
    this._content = (): Array<IPoEntry> => {
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
   * Gets the `type` property.
   *
   * @public
   * @readonly
   */
  public get type(): typeof ResourceType.Po {
    return this._type;
  }

  /**
   * Gets the `content` property.
   *
   * @public
   * @readonly
   */
  public get content(): ResourceContentFn<Array<IPoEntry>> {
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
   * Gets the keys of the resource data.
   *
   * @public
   */
  public keys(): Array<string> {
    return this.keyedEntries().map((entry) => entry.msgid);
  }

  /**
   * Gets the values of the resource data.
   *
   * @public
   */
  public values(): Array<string> {
    return this.keyedEntries().map((entry) => entry.msgstr);
  }

  /**
   * Gets the entries of the resource data.
   *
   * @public
   */
  public entries(): Array<[string, string]> {
    return this.keyedEntries().map((entry) => [entry.msgid, entry.msgstr] as [string, string]);
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
    resource: Pick<IPoResourceInfo, 'name' | 'path' | 'locale' | 'type' | 'content' | 'isVirtual'>,
  ): this {
    return new PoResourceInfo(resource) as this;
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
      // The header stays the first entry.
      if (!a.msgid || !b.msgid) {
        return a.msgid ? 1 : -1;
      }

      const comparison = a.msgid.localeCompare(b.msgid);
      return order === 'asc' ? comparison : -comparison;
    });

    this._cacheContent = sortedContent;

    return this;
  }

  /**
   * Converts the resource to a string: comments and references first, then the context, `msgid` and always `msgstr`.
   *
   * @public
   */
  public toString(): string {
    return this._content()
      .map((entry) =>
        [
          ...PoText.commentLines(entry.comments ?? ''),
          ...(entry.references ?? []).map((reference) => `#: ${reference}`),
          ...(entry.context ? [`msgctxt "${PoText.escape(entry.context)}"`] : []),
          `msgid "${PoText.escape(entry.msgid)}"`,
          `msgstr "${PoText.escape(entry.msgstr ?? '')}"`,
          '',
        ].join('\n'),
      )
      .join('\n');
  }

  /**
   * The entries that hold a key. The entry with the empty `msgid` is the header of the file.
   *
   * @private
   */
  private keyedEntries(): Array<IPoEntry> {
    return this._content().filter((entry) => entry.msgid !== '');
  }

  // #endregion
}
