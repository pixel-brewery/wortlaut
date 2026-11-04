// #region Imports
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = 'https://npm.pkg.github.com';

/**
 * The manifests of the release group. The root manifest belongs to it for its version, and it is private.
 */
function manifests() {
  const group = JSON.parse(readFileSync(join(root, 'nx.json'), 'utf8')).release.groups.wortlaut.projects;

  return execFileSync('git', ['ls-files', '*project.json'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
    .filter((file) => group.includes(JSON.parse(readFileSync(join(root, file), 'utf8')).name))
    .map((file) => JSON.parse(readFileSync(join(root, dirname(file), 'package.json'), 'utf8')))
    .filter((manifest) => !manifest.private);
}

test('every package of the release names GitHub Packages', () => {
  const packages = manifests();

  assert.equal(packages.length, 6);

  for (const manifest of packages) {
    assert.equal(manifest.publishConfig?.registry, registry, manifest.name);
  }
});

test('npm finds GitHub Packages for the scope, because Nx publishes with npm and asks it for the address', () => {
  const answer = execFileSync('npm', ['config', 'get', '@pixel-brewery:registry'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });

  assert.equal(answer.trim(), registry);
});

test('the checkout only names the variable of the token', () => {
  assert.deepEqual(readFileSync(join(root, '.npmrc'), 'utf8').trim().split(/\r?\n/u), [
    `@pixel-brewery:registry=${registry}`,
    '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}'
  ]);
});
