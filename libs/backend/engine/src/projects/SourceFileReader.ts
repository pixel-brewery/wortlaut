// #region Imports

import { readFileSync } from 'node:fs';
import { isSecretName, readEnvToken } from '@pixel-brewery/wortlaut-contracts';
import { applyEdits, modify, parseTree, type JSONPath, type Node } from 'jsonc-parser';

// #endregion

/**
 * The most text a view gets of a settings file.
 */
const MAX_SOURCE_CHARS = 256 * 1024;

/**
 * Reads a settings file for showing it: the value of every option named like a secret is masked, unless it is a token
 * such as `{env.GEMINI_API_KEY}`, which only names a variable.
 *
 * @internal
 * @param file The absolute path of the file.
 * @returns The text and whether it was cut at the bound.
 */
export function readSourceFile(file: string): { text: string; truncated: boolean } {
  const text = maskSecrets(readFileSync(file, 'utf8'));

  return text.length > MAX_SOURCE_CHARS
    ? { text: text.slice(0, MAX_SOURCE_CHARS), truncated: true }
    : { text, truncated: false };
}

/**
 * Masks the secret values of a JSON text, keeping the rest of it as it is.
 *
 * @internal
 * @param text The JSON text.
 * @returns The text without secret values. A text that is no JSON cannot be checked and is replaced by a notice.
 */
export function maskSecrets(text: string): string {
  const tree = parseTree(text);

  if (!tree) {
    return 'This file could not be read as JSON, so it is not shown.';
  }

  const paths = new Array<JSONPath>();

  collectSecretPaths(tree, [], paths);

  return paths.reduce(
    (masked, path) =>
      applyEdits(
        masked,
        modify(masked, path, '***', { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
      ),
    text,
  );
}

/**
 * @private
 */
function collectSecretPaths(node: Node, path: JSONPath, paths: Array<JSONPath>): void {
  if (node.type === 'array') {
    node.children?.forEach((child, index) => collectSecretPaths(child, [...path, index], paths));

    return;
  }

  if (node.type !== 'object') {
    return;
  }

  for (const property of node.children ?? []) {
    const [name, value] = property.children ?? [];
    const key = String(name?.value);

    if (value && isSecretName(key)) {
      if (typeof value.value !== 'string' || (value.value !== '' && !readEnvToken(value.value))) {
        paths.push([...path, key]);
      }
    } else if (value) {
      collectSecretPaths(value, [...path, key], paths);
    }
  }
}
