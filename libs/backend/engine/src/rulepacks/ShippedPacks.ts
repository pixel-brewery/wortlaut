// #region Imports

import type { RulePackManifest } from '@pixel-brewery/wortlaut-contracts';
import messageChecks from './shipped/message-checks/wortlaut-pack.json';

// #endregion

/**
 * The packs Wortlaut ships as data, in the format of any other pack, so they take the same path: the check, the pin in the lock
 * file and the verification. A repository has one only after adding it.
 *
 * @internal
 */
export namespace ShippedPacks {

    /**
     * Returns the packs.
     *
     * @returns Their definitions with the text of their files.
     */
    export function all(): Array<{ id: string; manifest: RulePackManifest; text: string }> {
        return [messageChecks as RulePackManifest].map((manifest) => ({ id: manifest.id, manifest, text: `${JSON.stringify(manifest, null, 2)}\n` }));
    }

    /**
     * Returns the text of a definition file.
     *
     * @param id The pack.
     * @returns The text, or `null` when Wortlaut ships no such pack.
     */
    export function textOf(id: string): string | null {
        return all().find((pack) => pack.id === id)?.text ?? null;
    }

}
