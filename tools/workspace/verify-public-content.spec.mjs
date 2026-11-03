// #region Imports

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGzip, gzipSync } from 'node:zlib';
import { findPrivateReferences } from './verify-public-content.mjs';

// #endregion

const privateFixture = String.fromCodePoint(102, 108, 97, 109, 111, 120);
const checker = fileURLToPath(new URL('./verify-public-content.mjs', import.meta.url));
const chunkBytes = 64 * 1024;

function repository(t) {
  mkdirSync('.codex-work', { recursive: true });
  const root = mkdtempSync(resolve('.codex-work/public-content-test-'));
  execFileSync('git', ['init', '--quiet', root]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('checks tracked and new source while respecting ignored local data', async (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, '.gitignore'), 'local-data/\n');
  writeFileSync(resolve(root, 'tracked.md'), 'Public example.');
  execFileSync('git', ['add', '.'], { cwd: root });
  mkdirSync(resolve(root, 'local-data'));
  writeFileSync(resolve(root, 'local-data/private.txt'), privateFixture);
  writeFileSync(resolve(root, 'new.md'), 'Another public example.');

  assert.deepEqual(await findPrivateReferences(root), []);
  writeFileSync(resolve(root, 'tracked.md'), privateFixture.toUpperCase());
  writeFileSync(resolve(root, 'new.md'), `A ${privateFixture}365 example.`);
  assert.deepEqual((await findPrivateReferences(root)).sort(), ['new.md', 'tracked.md']);
});

test('rejects private identifiers in file names', async (t) => {
  const root = repository(t);
  const filename = `${privateFixture.toUpperCase()}-reference.md`;
  writeFileSync(resolve(root, filename), 'Neutral content.');

  assert.deepEqual(await findPrivateReferences(root), [filename]);
});

test('checks dangling symlink targets without following them', async (t) => {
  const root = repository(t);
  try {
    symlinkSync(`${privateFixture.toUpperCase()}-outside`, resolve(root, 'reference'));
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') {
      t.skip('Windows account cannot create symbolic links.');
      return;
    }
    throw error;
  }

  assert.deepEqual(await findPrivateReferences(root), ['reference']);
});

test('rejects identifiers inside compressed vendor payloads', async (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, 'vendor.tgz'), gzipSync(`package/example.js\0${privateFixture}`));

  assert.deepEqual(await findPrivateReferences(root), ['vendor.tgz']);
});

test('rejects identifiers in UTF-16 content', async (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, 'fixture.txt'), Buffer.from(privateFixture.toUpperCase(), 'utf16le'));

  assert.deepEqual(await findPrivateReferences(root), ['fixture.txt']);
});

test('detects UTF-8 and unaligned UTF-16 names across raw and expanded chunk boundaries', async (t) => {
  const root = repository(t);
  for (const encoding of ['utf8', 'utf16le']) {
    const content = Buffer.concat([
      Buffer.alloc(chunkBytes - 3, 95),
      Buffer.from(privateFixture.toUpperCase(), encoding),
      Buffer.alloc(15, 95),
    ]);
    writeFileSync(resolve(root, `${encoding}.bin`), content);
    writeFileSync(resolve(root, `${encoding}.tgz`), gzipSync(content));
  }

  assert.deepEqual((await findPrivateReferences(root)).sort(), [
    'utf16le.bin',
    'utf16le.tgz',
    'utf8.bin',
    'utf8.tgz',
  ]);
});

test('scans clean archives expanded beyond 128 MiB using bounded stream chunks', async (t) => {
  const root = repository(t);
  const chunk = Buffer.alloc(chunkBytes, 95);
  async function* largeContents() {
    for (let index = 0; index < 2050; index++) yield chunk;
  }
  await pipeline(
    Readable.from(largeContents()),
    createGzip({ level: 1 }),
    createWriteStream(resolve(root, 'large.tgz')),
  );

  assert.deepEqual(await findPrivateReferences(root), []);
});

test('fails closed when a compressed file cannot be fully decoded', async (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, 'broken.tgz'), Buffer.from([0x1f, 0x8b, 0x08]));

  await assert.rejects(findPrivateReferences(root), { code: 'Z_BUF_ERROR' });
});

test('checks force-tracked ignored content and tolerates deleted tracked files', async (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, '.gitignore'), 'fixture.txt\n');
  writeFileSync(resolve(root, 'fixture.txt'), privateFixture);
  execFileSync('git', ['add', '--force', 'fixture.txt'], { cwd: root });

  assert.deepEqual(await findPrivateReferences(root), ['fixture.txt']);
  rmSync(resolve(root, 'fixture.txt'));
  assert.deepEqual(await findPrivateReferences(root), []);
});

test('CLI exits unsuccessfully without echoing private content', (t) => {
  const root = repository(t);
  writeFileSync(resolve(root, 'fixture.md'), privateFixture);
  writeFileSync(resolve(root, `${privateFixture.toUpperCase()}-fixture.md`), 'Public content.');
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture\.md/);
  assert.match(result.stderr, /\[private-project\]-fixture\.md/);
  assert.equal(result.stderr.toLowerCase().includes(privateFixture), false);
});
