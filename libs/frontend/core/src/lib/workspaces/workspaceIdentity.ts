/**
 * Derives the short code of a workspace from its name: the initials of the first two words, or the first two letters
 * of a single word.
 *
 * @param name The name.
 * @returns The code in capitals, or nothing when the name holds no letter or digit.
 */
export function workspaceCodeOf(name: string): string {
    const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
    const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) ?? '';

    return letters.toLocaleUpperCase('en').replace(/[^\p{Lu}\p{Nd}]/gu, '');
}

/**
 * The colors a workspace can have, with the token family of their swatches.
 */
export const WORKSPACE_COLORS = [
    { id: 'teal', token: 'var(--mosaik-color-secondary-200)' },
    { id: 'blue', token: 'var(--mosaik-color-info-200)' },
    { id: 'violet', token: 'var(--mosaik-color-highlight-200)' },
    { id: 'orange', token: 'var(--mosaik-color-tertiary-200)' },
    { id: 'green', token: 'var(--mosaik-color-success-200)' }
] as const;
