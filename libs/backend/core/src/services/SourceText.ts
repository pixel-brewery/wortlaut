/**
 * Test and specification files, whose strings and key references do not count.
 */
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/i;

/**
 * Returns whether a file is a test or specification file.
 *
 * @public
 * @param path The path of the file.
 * @returns `true` for a test file.
 */
export function isTestFile(path: string): boolean {
    return TEST_FILE.test(path);
}
