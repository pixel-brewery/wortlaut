// #region Imports

import { extractFile, listPackage } from '@electron/asar';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const output = resolve(root, process.env['WORTLAUT_OUTPUT_DIR'] ?? 'out');
const packageRoot = join(output, `${source.productName}-${process.platform}-${process.arch}`);
const resources =
  process.platform === 'darwin'
    ? join(packageRoot, `${source.productName}.app/Contents/Resources`)
    : join(packageRoot, 'resources');
const archive = join(resources, 'app.asar');
const failures = [];

const normalize = (path) => path.replaceAll('\\', '/').replace(/^\/+/, '');

// The lookup of the archive splits on the separator of the host.
const member = (path) => path.split('/').join(sep);
const entries = listPackage(archive, {}).map(normalize);
const required = [
  'package.json',
  'dist/apps/desktop/main.cjs',
  'dist/apps/desktop/preload.cjs',
  'dist/apps/frontend/app/browser/index.html',
];

for (const path of required) {
  if (!entries.includes(path)) {
    failures.push(`The package lacks ${path}.`);
  }
}

for (const path of required.slice(1)) {
  if (
    entries.includes(path) &&
    !extractFile(archive, member(path)).equals(readFileSync(join(root, path)))
  ) {
    failures.push(`The packaged ${path} differs from the current build.`);
  }
}

const allowed = /^(?:package\.json$|dist(?:$|\/apps(?:$|\/desktop(?:$|\/)|\/frontend(?:$|\/))))/u;
const forbidden =
  /(?:^|\/)(?:node_modules|\.env[^/]*|\.wortlaut|\.codex-work|\.git)(?:\/|$)|\.(?:spec\.[cm]?[jt]s|map)$/u;

for (const path of entries) {
  if (!allowed.test(path)) {
    failures.push(`The package holds ${path}, which is not part of the app.`);
  }

  if (forbidden.test(path)) {
    failures.push(`The package holds ${path}, which must never ship.`);
  }
}

const manifest = entries.includes('package.json')
  ? JSON.parse(extractFile(archive, 'package.json').toString('utf8'))
  : {};

for (const [field, expected] of [
  ['name', source.name],
  ['productName', source.productName],
  ['version', source.version],
  ['private', true],
  ['main', 'dist/apps/desktop/main.cjs'],
  ['type', 'commonjs'],
]) {
  if (manifest[field] !== expected) {
    failures.push(
      `The packaged manifest has ${field} ${String(manifest[field])} instead of ${String(expected)}.`,
    );
  }
}

for (const field of ['dependencies', 'devDependencies', 'resolutions', 'workspaces', 'scripts']) {
  if (field in manifest) {
    failures.push(`The packaged manifest still names ${field}.`);
  }
}

if (statSync(join(resources, 'LICENSE')).size === 0) {
  failures.push('The package has no license.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

mkdirSync(join(root, '.codex-work/out'), { recursive: true });
writeFileSync(
  join(root, '.codex-work/out/package-verification.json'),
  `${JSON.stringify({ version: manifest.version, platform: process.platform, arch: process.arch, entries: entries.length }, null, 2)}\n`,
);
console.log(
  `The package of ${manifest.version} for ${process.platform}/${process.arch} holds ${entries.length} entries of the app and nothing else.`,
);
