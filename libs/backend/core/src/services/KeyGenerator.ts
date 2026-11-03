/**
 * The prefix and the suffix of the keys of a project.
 *
 * @public
 */
export interface IKeyAffixes {
    prefix: string;
    suffix: string;
}

/**
 * Service for generating keys from string values.
 *
 * @public
 */
export class KeyGenerator {

    /**
     * Generates a unique key based on the string value.
     *
     * @public
     * @param value The string value to generate a key for.
     * @returns The generated key in dot notation.
     * @example
     * ```typescript
     * const key = KeyGeneratorService.generate("Facts Title 🎉");
     * console.log(key); // "facts.title"
     * ```
     */
    public generate(value: string): string {
        return value
            .toLowerCase()
            .replace(/[\p{Emoji_Presentation}\p{Emoji}\u200D]+/gu, '') // Remove emojis
            .replace(/\s+/g, '.') // Replace spaces with dots
            .replace(/[^\w.]/g, '') // Remove non-alphanumeric characters except dots
            .replace(/\.+/g, '.') // Collapse multiple dots into one
            .replace(/^\./, '') // Remove leading dot if any
            .replace(/\.$/, ''); // Remove trailing dot if any
    }

    /**
     * Generates the key of a project: with its prefix and suffix, so the next scan reads it as a key.
     *
     * @public
     * @param value The string value to generate a key for.
     * @param affixes The prefix and the suffix of the project's keys.
     * @returns The key, or an empty text when the value holds nothing to name a key after.
     */
    public generateWithAffixes(value: string, affixes: IKeyAffixes): string {
        const name = this.generate(value);

        return name ? this.withAffixes(name, affixes) : '';
    }

    /**
     * Puts a name between the prefix and the suffix of the project's keys.
     *
     * @public
     * @param name The name of the key.
     * @param affixes The prefix and the suffix.
     * @returns The key.
     */
    public withAffixes(name: string, affixes: IKeyAffixes): string {
        const { prefix, suffix } = affixes;

        return `${prefix && !prefix.endsWith('.') ? `${prefix}.` : prefix}${name}${suffix && !suffix.startsWith('.') ? `.${suffix}` : suffix}`;
    }

}
