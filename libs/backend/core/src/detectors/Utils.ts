/**
 * Escapes special characters in a string for use in a regular expression.
 *
 * @param value The string to escape.
 * @returns The escaped string.
 *
 * @example
 * ```typescript
 * const escaped = escapeRegExp(".*+?^${}()|[]\\");
 * console.log(escaped); // \.\*\+\?\^\$\{\}$begin:math:text$$end:math:text$\|$begin:math:display$$end:math:display$\\
 * ```
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a string is a valid resource key.
 *
 * @param key The string to check.
 * @param prefix An optional prefix that valid keys should start with (e.g., `loc.`).
 * @param suffix An optional suffix that valid keys should end with (e.g., `.key`).
 * @returns `true` if the string is a valid resource key, otherwise `false`.
 *
 * @example
 * ```typescript
 * const isValid = isResourceKey("loc.this.is.a.key", "loc.");
 * console.log(isValid); // true
 *
 * const isValid = isResourceKey("this.is.a.key", "loc.");
 * console.log(isValid); // false
 *
 * const isValid = isResourceKey("loc.this.is.a.key", "loc.", ".value");
 * console.log(isValid); // false
 *
 * const isValid = isResourceKey("this is invalid", "loc.");
 * console.log(isValid); // false
 *
 * const isValid = isResourceKey("a.valid.key");
 * console.log(isValid); // true
 * ```
 */
export function isResourceKey(key: string, prefix?: string, suffix?: string): boolean {
  // Check for prefix, if specified
  if (prefix && !key.startsWith(prefix)) {
    return false; // Key must start with the given prefix
  }

  // Check for suffix, if specified
  if (suffix && !key.endsWith(suffix)) {
    return false; // Key must end with the given suffix
  }

  // Check for spaces
  if (/\s/.test(key)) {
    return false; // Keys should not contain spaces
  }

  // All conditions met: key is considered a resource key
  return true;
}
