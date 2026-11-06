// #region Imports

import { isSecretName } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The mask that replaces a secret.
 */
const MASK = '***';

/**
 * Shorter values are no credentials, and masking them would only garble the text.
 */
const MIN_SECRET_LENGTH = 4;

/**
 * Keeps known secret values out of everything a run stores or shows.
 *
 * @public
 */
export class SecretScrubber {
  // #region Fields

  private readonly _secrets: Set<string>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `SecretScrubber` class.
   *
   * @public
   */
  public constructor() {
    this._secrets = new Set();
  }

  // #endregion

  // #region Methods

  /**
   * Adds a secret value, also in its URL-encoded form, because providers may echo it inside a URL.
   *
   * @public
   * @param value The secret.
   */
  public add(value: string | null | undefined): void {
    if (value && value.length >= MIN_SECRET_LENGTH) {
      this._secrets.add(value);
      this._secrets.add(encodeURIComponent(value));
    }
  }

  /**
   * Replaces every known secret in a text.
   *
   * @public
   * @param text The text.
   * @returns The text without secrets.
   */
  public scrub(text: string): string {
    let result = text;

    for (const secret of this._secrets) {
      result = result.split(secret).join(MASK);
    }

    return result;
  }

  /**
   * Copies options for storing: options named like a secret are dropped, every other string is scrubbed.
   *
   * @public
   * @param value The options.
   * @returns The JSON-safe copy.
   */
  public sanitize(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.scrub(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key, item]) => !isSecretName(key) && typeof item !== 'function' && item !== undefined,
          )
          .map(([key, item]) => [key, this.sanitize(item)]),
      );
    }

    return value;
  }

  // #endregion
}
