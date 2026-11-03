// #region Imports

import { execFileSync } from 'node:child_process';
import { createReadStream, lstatSync, readlinkSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

// #endregion

// Keep the excluded private identifiers out of public source, including this guard.
const privateIdentifiers = [
  String.fromCodePoint(102, 108, 97, 109, 111, 120),
  String.fromCodePoint(115, 116, 114, 105, 118, 105, 111),
];
const patterns = privateIdentifiers.flatMap((identifier) => [
  Buffer.from(identifier, 'utf8'),
  Buffer.from(identifier, 'utf16le'),
]);
const overlapBytes = Math.max(...patterns.map((pattern) => pattern.length)) - 1;
const chunkBytes = 64 * 1024;

function containsPrivateIdentifier(content) {
  const normalized = Buffer.from(content);
  for (let index = 0; index < normalized.length; index++) {
    const byte = normalized[index];
    if (byte >= 65 && byte <= 90) normalized[index] = byte + 32;
  }
  return patterns.some((pattern) => normalized.includes(pattern));
}

async function streamContainsPrivateIdentifier(source, transforms = []) {
  return pipeline(source, ...transforms, async (chunks) => {
    let overlap = Buffer.alloc(0);
    let found = false;
    for await (const chunk of chunks) {
      if (found) continue;
      const content = Buffer.concat([overlap, chunk]);
      found = containsPrivateIdentifier(content);
      // Preserve whole byte sequences, including UTF-16 names at odd offsets.
      overlap = content.subarray(Math.max(0, content.length - overlapBytes));
    }
    return found;
  });
}

async function isGzipFile(filename) {
  const handle = await open(filename, 'r');
  try {
    const header = Buffer.alloc(2);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === 2 && header[0] === 0x1f && header[1] === 0x8b;
  } finally {
    await handle.close();
  }
}

/** Check published source paths, working content and decoded vendor archives. */
export async function findPrivateReferences(root = process.cwd()) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
    .split('\0')
    .filter(Boolean);
  const violations = [];

  for (const path of new Set(paths)) {
    const absolute = resolve(root, path);
    let metadata;
    try {
      metadata = lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!metadata.isFile() && !metadata.isSymbolicLink()) continue;

    let found = privateIdentifiers.some((identifier) => path.toLowerCase().includes(identifier));
    if (!found && metadata.isSymbolicLink()) {
      found = containsPrivateIdentifier(Buffer.from(readlinkSync(absolute)));
    } else if (!found) {
      const compressed = await isGzipFile(absolute);
      found = await streamContainsPrivateIdentifier(
        createReadStream(absolute, { highWaterMark: chunkBytes }),
      );
      if (!found && compressed) {
        // Backpressure bounds memory independently of expanded tar/archive size.
        found = await streamContainsPrivateIdentifier(
          createReadStream(absolute, { highWaterMark: chunkBytes }),
          [createGunzip({ chunkSize: chunkBytes })],
        );
      }
    }
    if (found) violations.push(path);
  }
  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await findPrivateReferences();
  if (violations.length) {
    console.error(`Private project references found in ${violations.length} file(s):`);
    for (const path of violations) {
      const publicPath = path.replace(new RegExp(privateIdentifiers.join('|'), 'gi'), '[private-project]');
      console.error(`- ${publicPath}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      'Public source paths, content and decoded archives contain no private project references.',
    );
  }
}
