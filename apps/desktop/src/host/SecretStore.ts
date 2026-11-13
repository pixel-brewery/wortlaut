// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import type { KeyProviderId } from '@pixel-brewery/wortlaut-ai';
import { writePrivateFileAtomically } from '@pixel-brewery/wortlaut-engine';

// #endregion

/**
 * Credentials kept in main; the GitHub token is only used for rule packs.
 */
type SecretId = KeyProviderId | 'github';

/**
 * Where the API keys of the app live. Main holds them: a request of the renderer can set, test and clear a key and learn whether
 * one exists, and nothing it receives holds one.
 *
 * @public
 */
export interface ISecretStore {
  set(provider: SecretId, key: string): void;

  /**
   * Returns a key, for main only.
   */
  get(provider: SecretId): string | null;
  has(provider: SecretId): boolean;
  clear(provider: SecretId): void;
}

/**
 * What the store needs of Electron's `safeStorage`.
 *
 * @public
 */
export interface ISafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(bytes: Buffer): string;
}

/**
 * Keeps API keys encrypted by the keychain of the system, in a private file of the profile. Whether a key exists is read from
 * the file alone, so looking at the settings raises no keychain dialog. Without encryption it refuses: a key is never stored in
 * plain text.
 *
 * @public
 */
export class KeychainSecretStore implements ISecretStore {
  // #region Fields

  private readonly _file: string;
  private readonly _safeStorage: ISafeStorageLike;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `KeychainSecretStore` class.
   *
   * @public
   * @param file The private file in the profile.
   * @param safeStorage What encrypts the keys.
   */
  public constructor(file: string, safeStorage: ISafeStorageLike) {
    this._file = file;
    this._safeStorage = safeStorage;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   * @throws Error when the system cannot encrypt.
   */
  public set(provider: SecretId, key: string): void {
    if (!this._safeStorage.isEncryptionAvailable()) {
      throw new Error('The system keychain is not available, so this key is not stored.');
    }

    this.write({
      ...this.read(),
      [provider]: this._safeStorage.encryptString(key).toString('base64'),
    });
  }

  /**
   * @override
   */
  public get(provider: SecretId): string | null {
    const stored = this.read()[provider];

    if (!stored) {
      return null;
    }

    try {
      return this._safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return null;
    }
  }

  /**
   * @override
   */
  public has(provider: SecretId): boolean {
    return Boolean(this.read()[provider]);
  }

  /**
   * @override
   */
  public clear(provider: SecretId): void {
    const { [provider]: _removed, ...others } = this.read();

    this.write(others);
  }

  /**
   * @private
   */
  private read(): Partial<Record<SecretId, string>> {
    try {
      return existsSync(this._file)
        ? (JSON.parse(readFileSync(this._file, 'utf8')) as Partial<Record<SecretId, string>>)
        : {};
    } catch {
      return {};
    }
  }

  /**
   * @private
   */
  private write(keys: Partial<Record<SecretId, string>>): void {
    writePrivateFileAtomically(this._file, `${JSON.stringify(keys, null, 2)}\n`);
  }

  // #endregion
}

/**
 * Holds keys in memory only, for automated runs that must not touch the keychain of the system.
 *
 * @public
 */
export class MemorySecretStore implements ISecretStore {
  // #region Fields

  private readonly _keys = new Map<SecretId, string>();

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public set(provider: SecretId, key: string): void {
    this._keys.set(provider, key);
  }

  /**
   * @override
   */
  public get(provider: SecretId): string | null {
    return this._keys.get(provider) ?? null;
  }

  /**
   * @override
   */
  public has(provider: SecretId): boolean {
    return this._keys.has(provider);
  }

  /**
   * @override
   */
  public clear(provider: SecretId): void {
    this._keys.delete(provider);
  }

  // #endregion
}
