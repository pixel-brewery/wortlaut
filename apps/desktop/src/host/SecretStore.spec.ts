// #region Imports

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeychainSecretStore, MemorySecretStore, type ISafeStorageLike, type ISecretStore } from './SecretStore';

// #endregion

/**
 * An obvious test value.
 */
const KEY = 'test-key-not-real';

/**
 * Stands in for Electron's `safeStorage`. It reverses the bytes, so the plain key cannot show up by accident.
 */
function fakeSafeStorage(available = true): ISafeStorageLike {
    return {
        isEncryptionAvailable: vi.fn(() => available),
        encryptString: vi.fn((text: string) => Buffer.from(text).reverse()),
        decryptString: vi.fn((bytes: Buffer) => Buffer.from(bytes).reverse().toString())
    };
}

describe('the secret stores', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-secrets-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe.each<[string, () => ISecretStore]>([
        ['KeychainSecretStore', () => new KeychainSecretStore(join(root, 'keys.json'), fakeSafeStorage())],
        ['MemorySecretStore', () => new MemorySecretStore()]
    ])('%s keeps the contract', (_name, create) => {
        it('sets, reads, knows and clears a key per provider', () => {
            // arrange
            const store = create();

            // act
            store.set('openai', KEY);

            // assert
            expect(store.has('openai')).toBe(true);
            expect(store.get('openai')).toBe(KEY);
            expect(store.has('google')).toBe(false);
            expect(store.get('google')).toBeNull();

            store.clear('openai');
            expect(store.has('openai')).toBe(false);
            expect(store.get('openai')).toBeNull();
        });

        it('replaces a key', () => {
            // arrange
            const store = create();

            // act
            store.set('google', 'first-value');
            store.set('google', 'second-value');

            // assert
            expect(store.get('google')).toBe('second-value');
        });

        it('clears a key that does not exist without complaint', () => {
            // act & assert
            expect(() => create().clear('google')).not.toThrow();
        });
    });

    describe('KeychainSecretStore', () => {
        it('never writes a key in plain text, and keeps the file private', () => {
            // arrange
            const file = join(root, 'keys.json');

            // act
            new KeychainSecretStore(file, fakeSafeStorage()).set('openai', KEY);

            // assert
            expect(readFileSync(file, 'utf8')).not.toContain(KEY);
            expect(statSync(file).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
        });

        it('refuses a key when the system cannot encrypt, and stores nothing', () => {
            // arrange
            const store = new KeychainSecretStore(join(root, 'keys.json'), fakeSafeStorage(false));

            // act & assert
            expect(() => store.set('openai', KEY)).toThrow(/not stored/);
            expect(store.has('openai')).toBe(false);
        });

        it('learns whether a key exists without asking the keychain', () => {
            // arrange
            const file = join(root, 'keys.json');

            new KeychainSecretStore(file, fakeSafeStorage()).set('openai', KEY);

            const safeStorage = fakeSafeStorage();

            // act
            const exists = new KeychainSecretStore(file, safeStorage).has('openai');

            // assert
            expect(exists).toBe(true);
            expect(safeStorage.decryptString).not.toHaveBeenCalled();
            expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled();
        });

        it('treats a key that cannot be decrypted as missing', () => {
            // arrange
            const file = join(root, 'keys.json');

            new KeychainSecretStore(file, fakeSafeStorage()).set('openai', KEY);

            const broken = fakeSafeStorage();

            vi.mocked(broken.decryptString).mockImplementation(() => {
                throw new Error('keychain says no');
            });

            // act & assert
            expect(new KeychainSecretStore(file, broken).get('openai')).toBeNull();
        });
    });
});
