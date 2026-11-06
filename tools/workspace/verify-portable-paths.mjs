// #region Imports

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
const ignored = new Set([
  '.git',
  '.nx',
  '.angular',
  '.yarn',
  '.cache',
  '.codex-work',
  'node_modules',
  'dist',
  'out',
  'coverage',
]);
const textExtensions = /\.(?:ts|mts|cts|js|mjs|cjs|json|toml|yaml|yml|md|py|html|scss)$/;
const personalPath =
  /(?:^|[\s"'=(\x60])(?:\/Users\/[^/\s]+\/|[A-Z]:\\Users\\[^\\\s]+\\|\/home\/[^/\s]+\/)/;
const failures = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }

    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await inspect(path);
    } else if (textExtensions.test(entry.name)) {
      const name = relative(root, path).replaceAll('\\', '/');

      // The imported skill is pinned by its hash and cannot change here.
      if (name.startsWith('.agents/skills/architecture/')) {
        continue;
      }

      (await readFile(path, 'utf8')).split('\n').forEach((line, index) => {
        if (personalPath.test(line)) {
          failures.push(`${name}:${index + 1}`);
        }
      });
    }
  }
}

await inspect(root);

if (failures.length > 0) {
  console.error(`Personal absolute paths found:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Portable path check passed.');
}
