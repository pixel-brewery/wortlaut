// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { prepareReleaseAssets } from './prepare-release-assets.mjs';
// #endregion

async function fixture(t) {
  await mkdir('.codex-work', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/release-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'input');
  for (const target of ['darwin-arm64', 'win32-x64'])
    await mkdir(join(input, `installer-${target}`), { recursive: true });
  await writeFile(join(input, 'installer-darwin-arm64/Wortlaut.dmg'), 'macOS fixture');
  await writeFile(join(input, 'installer-win32-x64/WortlautSetup.exe'), 'Windows fixture');
  return {
    input,
    output: join(root, 'output'),
    version: '1.2.3',
    sourceCommit: 'a'.repeat(40),
    releaseCommit: 'b'.repeat(40),
  };
}

test('prepares both supported installers with exact checksums, sizes and immutable URLs', async (t) => {
  const options = await fixture(t);

  const receipt = await prepareReleaseAssets(options);

  assert.equal(receipt.files.length, 3);
  assert.equal(receipt.sourceCommit, options.sourceCommit);
  assert.equal(receipt.releaseCommit, options.releaseCommit);
  const checksums = await readFile(join(options.output, 'assets/SHA256SUMS.txt'), 'utf8');
  for (const [name, original] of [
    ['Wortlaut-darwin-arm64-1.2.3.dmg', 'macOS fixture'],
    ['Wortlaut-win32-x64-1.2.3.exe', 'Windows fixture'],
  ]) {
    const sha256 = createHash('sha256').update(original).digest('hex');
    const file = receipt.files.find((candidate) => candidate.name === name);
    assert.equal(file.bytes, Buffer.byteLength(original));
    assert.equal(file.sha256, sha256);
    assert.equal(
      file.url,
      `https://github.com/pixel-brewery/wortlaut/releases/download/v1.2.3/${name}`,
    );
    assert.equal(await readFile(join(options.output, 'assets', name), 'utf8'), original);
    assert.ok(checksums.includes(`${sha256}  ${name}\n`));
  }
});

test('rejects incomplete, ambiguous and empty installer sets before producing publication output', async (t) => {
  const options = await fixture(t);
  const windows = join(options.input, 'installer-win32-x64/WortlautSetup.exe');
  await writeFile(windows, '');
  await assert.rejects(prepareReleaseAssets(options), /must not be empty/u);
  await writeFile(windows, 'Windows fixture');
  await writeFile(join(options.input, 'installer-win32-x64/other.exe'), 'unexpected installer');
  await assert.rejects(prepareReleaseAssets(options), /Exactly one/u);
  await rm(join(options.input, 'installer-win32-x64/other.exe'));
  await rm(windows);
  await assert.rejects(prepareReleaseAssets(options), /Exactly one/u);
});

test('rejects unsupported release versions and missing immutable source identities', async (t) => {
  const options = await fixture(t);
  for (const version of ['1.2.3-beta.1', '01.2.3', '65536.0.0', undefined])
    await assert.rejects(prepareReleaseAssets({ ...options, version }), /release version/u);
  await assert.rejects(
    prepareReleaseAssets({ ...options, releaseCommit: 'main' }),
    /Exact source/u,
  );
});

test('preserves existing output and refuses symbolic-link installer inputs', async (t) => {
  const options = await fixture(t);
  await mkdir(options.output);
  await writeFile(join(options.output, 'keep.txt'), 'keep existing output');
  await assert.rejects(prepareReleaseAssets(options), /dedicated empty/u);
  assert.equal(await readFile(join(options.output, 'keep.txt'), 'utf8'), 'keep existing output');
  const windows = join(options.input, 'installer-win32-x64/WortlautSetup.exe');
  await rm(windows);
  try {
    await symlink('../installer-darwin-arm64/Wortlaut.dmg', windows);
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return;
    throw error;
  }
  await assert.rejects(prepareReleaseAssets(options), /regular files/u);
});
