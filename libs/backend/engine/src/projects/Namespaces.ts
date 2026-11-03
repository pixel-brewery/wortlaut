// #region Imports

import type { NamespaceCount } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Returns a key without the project's prefix.
 *
 * @internal
 * @param key The key.
 * @param prefix The prefix.
 * @returns The rest of the key.
 */
export function withoutPrefix(key: string, prefix: string): string {
    const head = prefix.endsWith('.') ? prefix : `${prefix}.`;

    return prefix && key.startsWith(head) ? key.slice(head.length) : key;
}

/**
 * Creates what says the namespace of a key: the first segment after what all keys share, which is at least the prefix.
 *
 * @internal
 * @param keys All keys.
 * @param prefix The prefix.
 * @returns The function.
 */
export function createNamespaceOf(keys: ReadonlyArray<string>, prefix: string): (key: string) => string {
    const shared = sharedSegments(keys.map((key) => withoutPrefix(key, prefix).split('.')));

    return (key) => {
        const segments = withoutPrefix(key, prefix).split('.');

        return segments[shared] ?? segments[segments.length - 1];
    };
}

/**
 * Counts the keys per namespace.
 *
 * @internal
 * @param keys All keys.
 * @param prefix The prefix.
 * @returns The namespaces, largest first.
 */
export function countNamespaces(keys: ReadonlyArray<string>, prefix: string): Array<NamespaceCount> {
    const namespaceOf = createNamespaceOf(keys, prefix);
    const counts = new Map<string, number>();

    for (const key of keys) {
        const name = namespaceOf(key);

        counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * @private
 */
function sharedSegments(keys: ReadonlyArray<ReadonlyArray<string>>): number {
    if (keys.length === 0) {
        return 0;
    }

    // The last segment names the text itself, so a catalog with one namespace still shows that namespace.
    const shortest = Math.min(...keys.map((segments) => segments.length)) - 1;
    let shared = 0;

    while (shared < shortest && keys.every((segments) => segments[shared] === keys[0][shared])) {
        shared++;
    }

    return shared;
}
