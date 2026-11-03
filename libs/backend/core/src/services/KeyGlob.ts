/**
 * Returns whether a key matches a pattern, where `*` matches any sequence of characters. It runs without a regular expression
 * and takes at most the length of the key times the length of the pattern, so a pattern from outside cannot make it hang.
 *
 * @public
 * @param pattern The pattern.
 * @param key The key.
 * @returns `true` when the pattern covers the whole key.
 */
export function matchesKeyGlob(pattern: string, key: string): boolean {
    let patternIndex = 0;
    let keyIndex = 0;
    let lastStar = -1;
    let resume = 0;

    while (keyIndex < key.length) {
        if (patternIndex < pattern.length && pattern[patternIndex] === '*') {
            lastStar = patternIndex++;
            resume = keyIndex;
        } else if (patternIndex < pattern.length && pattern[patternIndex] === key[keyIndex]) {
            patternIndex++;
            keyIndex++;
        } else if (lastStar >= 0) {
            patternIndex = lastStar + 1;
            keyIndex = ++resume;
        } else {
            return false;
        }
    }

    while (patternIndex < pattern.length && pattern[patternIndex] === '*') {
        patternIndex++;
    }

    return patternIndex === pattern.length;
}
