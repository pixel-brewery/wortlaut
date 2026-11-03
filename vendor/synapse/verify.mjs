// #region Imports

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const directory = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'));

if (manifest.schemaVersion !== 1 || manifest.familyVersion !== '0.0.3' || manifest.packages.length !== 6)
  throw new Error('Unexpected Synapse artifact manifest.');

for (const entry of manifest.packages) {
  if (!/^synapse-[a-z-]+-0\.0\.3\.tgz$/u.test(entry.file))
    throw new Error('Invalid Synapse archive path.');

  const content = await readFile(join(directory, entry.file));
  const digest = createHash('sha256').update(content).digest('hex');

  if (content.length !== entry.bytes || digest !== entry.sha256)
    throw new Error(`Synapse archive does not match its provenance: ${entry.name}`);
}

process.stdout.write('Verified six unmodified Synapse 0.0.3 distribution archives.\n');
