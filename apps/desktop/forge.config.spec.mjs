// #region Imports

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #endregion

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

test('writes a minimal manifest into the staging directory, and Packager keeps it', async () => {
  // arrange
  const { default: config } = await import('./forge.config.mjs');
  const scratch = join(root, '.codex-work');

  await mkdir(scratch, { recursive: true });

  const directory = await mkdtemp(join(scratch, 'forge-manifest-'));

  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: 'wortlaut',
        productName: 'Wortlaut',
        version: '0.0.1',
        private: true,
        description: 'Fixture',
        author: 'Fixture',
        license: 'MIT',
        main: 'source-only.js',
        scripts: { build: 'fixture' },
        devDependencies: { 'source-only': '1.0.0' },
        resolutions: { 'source-only': 'file:./fixture.tgz' },
        workspaces: ['fixture'],
      }),
    );

    // act
    await config.hooks.packageAfterCopy(config, directory);

    let manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));

    for (const sanitize of config.packagerConfig.sanitizePackageJson) {
      manifest = await sanitize(manifest, '45.1.0', process.platform, process.arch);
    }

    // assert
    assert.equal(manifest.main, 'dist/apps/desktop/main.cjs');
    assert.equal(manifest.private, true);
    assert.deepEqual(Object.keys(manifest).sort(), [
      'author',
      'description',
      'license',
      'main',
      'name',
      'private',
      'productName',
      'type',
      'version',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('refuses to write the manifest over the repository', async () => {
  // arrange
  const { default: config } = await import('./forge.config.mjs');

  // assert
  await assert.rejects(config.hooks.packageAfterCopy(config, root), /staging directory/u);
});

test('packages the bundles and the renderer, and nothing else of the repository', async () => {
  // arrange
  const { default: config } = await import('./forge.config.mjs');
  const isIgnored = (path) => config.packagerConfig.ignore.some((pattern) => pattern.test(path));

  // assert
  for (const path of [
    '/package.json',
    '/dist',
    '/dist/apps',
    '/dist/apps/desktop/main.cjs',
    '/dist/apps/desktop/preload.cjs',
    '/dist/apps/frontend/app/browser/index.html',
  ]) {
    assert.equal(isIgnored(path), false, path);
  }

  for (const path of [
    '/node_modules/zod/package.json',
    '/libs/backend/engine/src/Index.ts',
    '/apps/desktop/src/main.ts',
    '/.codex-work/x',
    '/out/x',
    '/yarn.lock',
    '/dist/libs/x.js',
    '/dist/apps/desktop/main.cjs.map',
  ]) {
    assert.equal(isIgnored(path), true, path);
  }
});

test('flips no fuse, as Resonanz does not', async () => {
  // arrange
  const { default: config } = await import('./forge.config.mjs');
  const source = await readFile(join(here, 'forge.config.mjs'), 'utf8');

  // assert
  assert.equal(config.plugins, undefined);
  assert.equal(/FuseV1|plugin-fuses|flipFuses/u.test(source), false);
});

for (const platform of ['darwin', 'win32', 'linux']) {
  test(`packages for ${platform} without a certificate, even when credentials are around`, () => {
    // act
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
            import assert from 'node:assert/strict';
            Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
            const { default: config } = await import(${JSON.stringify(new URL('./forge.config.mjs', import.meta.url).href)});
            const options = config.packagerConfig;
            assert.equal(options.osxNotarize, undefined);
            assert.equal(options.windowsSign, undefined);
            if (process.platform === 'darwin') {
                assert.equal(options.osxSign.identity, '-');
                assert.equal(options.osxSign.identityValidation, false);
                assert.equal(options.osxSign.optionsForFile('Wortlaut.app').hardenedRuntime, false);
            } else {
                assert.equal(options.osxSign, undefined);
            }
        `,
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          APPLE_SIGNING_IDENTITY: 'Developer ID Application: Fixture',
          APPLE_API_KEY_PATH: 'fixture.p8',
          WINDOWS_CERTIFICATE_FILE: 'fixture.pfx',
        },
      },
    );

    // assert
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}
