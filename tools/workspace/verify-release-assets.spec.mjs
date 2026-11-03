// #region Imports
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyReleaseAssets } from './verify-release-assets.mjs';
// #endregion

function fixture() {
  const names = [
    'Wortlaut-darwin-arm64-1.2.3.dmg',
    'Wortlaut-win32-x64-1.2.3.exe',
    'SHA256SUMS.txt',
  ];
  const manifest = {
    schemaVersion: 1,
    version: '1.2.3',
    sourceCommit: 'a'.repeat(40),
    releaseCommit: 'b'.repeat(40),
    files: names.map((name) => ({
      name,
      bytes: 123,
      sha256: 'c'.repeat(64),
      url: `https://github.com/pixel-brewery/wortlaut/releases/download/v1.2.3/${name}`,
    })),
  };
  const release = {
    tag_name: 'v1.2.3',
    draft: false,
    prerelease: false,
    assets: manifest.files.map((file) => ({
      name: file.name,
      state: 'uploaded',
      size: file.bytes,
      digest: `sha256:${file.sha256}`,
      browser_download_url: file.url,
    })),
  };
  return { manifest, release };
}

function draftFixture() {
  const result = fixture();
  const slug = `untagged-${'d'.repeat(20)}`;
  result.release.draft = true;
  result.release.html_url = `https://github.com/pixel-brewery/wortlaut/releases/tag/${slug}`;
  for (const asset of result.release.assets)
    asset.browser_download_url = `https://github.com/pixel-brewery/wortlaut/releases/download/${slug}/${encodeURIComponent(asset.name)}`;
  return result;
}

test('accepts complete draft assets bound to the exact draft HTML slug', () => {
  const { manifest, release } = draftFixture();
  assert.deepEqual(verifyReleaseAssets(manifest, release), []);
});

test('keeps advertised manifest URLs canonical even while verifying a draft', () => {
  const { manifest, release } = draftFixture();
  manifest.files[0].url = release.assets[0].browser_download_url;
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
});

test('accepts the canonical asset URLs after the same draft is published', () => {
  const { manifest, release } = draftFixture();
  release.draft = false;
  release.html_url = 'https://github.com/pixel-brewery/wortlaut/releases/tag/v1.2.3';
  for (const [index, asset] of release.assets.entries())
    asset.browser_download_url = manifest.files[index].url;
  assert.deepEqual(verifyReleaseAssets(manifest, release), []);
});

test('allows only missing assets in an otherwise verified bound draft', () => {
  const { manifest, release } = draftFixture();
  release.assets.pop();
  assert.deepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  release.assets[0].size += 1;
  assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
});

for (const draft of [false, undefined, 'true', 1]) {
  test(`never accepts untagged URLs without literal draft=true (${String(draft)})`, () => {
    const { manifest, release } = draftFixture();
    release.draft = draft;
    assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  });
}

for (const [name, htmlUrl] of [
  ['missing', undefined],
  ['non-string', 123],
  [
    'foreign origin',
    `https://example.invalid/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}`,
  ],
  [
    'foreign repository',
    `https://github.com/pixel-brewery/other/releases/tag/untagged-${'d'.repeat(20)}`,
  ],
  [
    'credentials',
    `https://user@github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}`,
  ],
  [
    'insecure origin',
    `http://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}`,
  ],
  [
    'wrong slug',
    `https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'e'.repeat(20)}`,
  ],
  ['invalid slug', 'https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-invalid'],
  [
    'short slug',
    `https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(19)}`,
  ],
  [
    'query',
    `https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}?draft=true`,
  ],
  [
    'fragment',
    `https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}#assets`,
  ],
  [
    'trailing newline',
    `https://github.com/pixel-brewery/wortlaut/releases/tag/untagged-${'d'.repeat(20)}\n`,
  ],
]) {
  test(`rejects unbound draft HTML metadata: ${name}`, () => {
    const { manifest, release } = draftFixture();
    release.html_url = htmlUrl;
    assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  });
}

for (const [name, change] of [
  ['another draft', (url) => url.replace('d'.repeat(20), 'e'.repeat(20))],
  ['foreign origin', (url) => url.replace('github.com', 'example.invalid')],
  ['foreign repository', (url) => url.replace('/wortlaut/', '/other/')],
  ['wrong asset', (url) => url.replace('.dmg', '.exe')],
  ['noncanonical filename encoding', (url) => url.replace('Wortlaut-', 'Wortlaut%2D')],
  ['query', (url) => `${url}?download=true`],
  ['fragment', (url) => `${url}#download`],
  ['missing', () => undefined],
  ['non-string', () => 123],
]) {
  test(`rejects a mismatched draft asset URL: ${name}`, () => {
    const { manifest, release } = draftFixture();
    release.assets[0].browser_download_url = change(release.assets[0].browser_download_url);
    assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  });
}

for (const mutation of ['tag', 'size', 'digest', 'state', 'duplicate', 'extra', 'prerelease']) {
  test(`retains draft integrity checks for ${mutation} with recovery enabled`, () => {
    const { manifest, release } = draftFixture();
    if (mutation === 'tag') release.tag_name = 'v1.2.4';
    else if (mutation === 'prerelease') release.prerelease = true;
    else if (mutation === 'duplicate') release.assets.push({ ...release.assets[0] });
    else if (mutation === 'extra')
      release.assets.push({ ...release.assets[0], name: 'source.zip' });
    else release.assets[0][mutation] = mutation === 'size' ? 124 : 'unexpected';
    assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
  });
}

test('accepts only the exact complete installer and checksum asset publication', () => {
  const { manifest, release } = fixture();
  assert.deepEqual(verifyReleaseAssets(manifest, release), []);
});

test('permits missing draft assets for recovery without accepting changed or unexpected bytes', () => {
  const { manifest, release } = fixture();
  release.draft = true;
  release.assets.pop();
  assert.deepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  release.assets[0].digest = `sha256:${'d'.repeat(64)}`;
  assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
});

test('never permits missing assets in an already published release', () => {
  const { manifest, release } = fixture();
  release.assets.pop();
  assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
});

for (const mutation of [
  'tag',
  'size',
  'digest',
  'url',
  'state',
  'duplicate',
  'extra',
  'prerelease',
]) {
  test(`rejects a mismatched published ${mutation}`, () => {
    const { manifest, release } = fixture();
    if (mutation === 'tag') release.tag_name = 'v1.2.4';
    else if (mutation === 'prerelease') release.prerelease = true;
    else if (mutation === 'duplicate') release.assets.push({ ...release.assets[0] });
    else if (mutation === 'extra')
      release.assets.push({ ...release.assets[0], name: 'source.zip' });
    else
      Object.assign(release.assets[0], {
        [mutation === 'url' ? 'browser_download_url' : mutation]:
          mutation === 'size' ? 124 : 'unexpected',
      });
    assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  });
}

test('rejects unsupported targets and unbound source identities in the local receipt', () => {
  const { manifest, release } = fixture();
  manifest.files[0].name = 'Wortlaut-linux-x64-1.2.3.deb';
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  manifest.sourceCommit = 'main';
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
});
