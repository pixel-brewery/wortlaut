/**
 * Creates the regular expression of a declared key pattern, where `*` matches any sequence of characters, so
 * `loc.api.error.*` matches every key below `loc.api.error`.
 *
 * @public
 * @param pattern The key pattern.
 * @returns The regular expression that matches the whole key.
 */
export function createKeyPattern(pattern: string): RegExp {
  const parts = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(`^${parts.join('.*')}$`, 's');
}
