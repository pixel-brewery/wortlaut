// #region Imports

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// #endregion

const targets = [
  { platform: 'darwin', architecture: 'arm64', suffix: '.dmg' },
  { platform: 'win32', architecture: 'x64', suffix: '.exe' },
];

/**
 * Stages the two supported installers and their checksums.
 *
 * @param {{ input: string, output: string, version: string, sourceCommit: string, releaseCommit: string }} options Verified release identity and directories.
 * @returns {Promise<object>} The exact three-file publication receipt; publishes nothing.
 */
export async function prepareReleaseAssets({
  input,
  output,
  version,
  sourceCommit,
  releaseCommit,
}) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version ?? '') ||
    version.split('.').some((part) => Number(part) > 65_535)
  ) {
    throw new Error('A numeric release version within the Windows component range is required.');
  }

  if (![sourceCommit, releaseCommit].every((sha) => /^[a-f0-9]{40}$/u.test(sha ?? ''))) {
    throw new Error('Exact source and prepared release commits are required.');
  }

  const installers = [];

  for (const target of targets) {
    const files = await regularFiles(
      resolve(input, `installer-${target.platform}-${target.architecture}`),
    );

    if (files.length !== 1 || !files[0].endsWith(target.suffix)) {
      throw new Error(
        `Exactly one ${target.platform}/${target.architecture} installer is required.`,
      );
    }

    if (target.platform === 'win32' && basename(files[0]) !== 'WortlautSetup.exe') {
      throw new Error('The Windows input must be the Wortlaut Squirrel installer.');
    }

    if ((await lstat(files[0])).size === 0) {
      throw new Error('Installers must not be empty.');
    }

    installers.push({ ...target, source: files[0] });
  }

  const directory = resolve(output);

  await mkdir(directory, { recursive: true });

  if ((await lstat(directory)).isSymbolicLink() || (await readdir(directory)).length !== 0) {
    throw new Error('Release output must be a dedicated empty directory.');
  }

  const assets = join(directory, 'assets');
  const baseUrl = `https://github.com/pixel-brewery/wortlaut/releases/download/v${version}`;
  const files = [];

  await mkdir(assets);

  for (const installer of installers) {
    const name = `Wortlaut-${installer.platform}-${installer.architecture}-${version}${installer.suffix}`;

    await copyFile(installer.source, join(assets, name));
    files.push(await describe(join(assets, name), baseUrl));
  }

  const checksums = join(assets, 'SHA256SUMS.txt');

  await writeFile(
    checksums,
    files.map((file) => `${file.sha256}  ${file.name}\n`).join(''),
    'utf8',
  );
  files.push(await describe(checksums, baseUrl));

  const receipt = { schemaVersion: 1, version, sourceCommit, releaseCommit, files };

  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`);

  return receipt;
}

async function describe(path, baseUrl) {
  const digest = createHash('sha256');

  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
  }

  return {
    name: basename(path),
    bytes: (await lstat(path)).size,
    sha256: digest.digest('hex'),
    url: `${baseUrl}/${encodeURIComponent(basename(path))}`,
  };
}

async function regularFiles(directory) {
  const information = await lstat(directory);

  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error('Release input directories must not be symbolic links.');
  }

  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await regularFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error('Release inputs must contain regular files only.');
    }
  }

  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      version: { type: 'string' },
      source: { type: 'string' },
      commit: { type: 'string' },
    },
  });

  if (['input', 'output', 'version', 'source', 'commit'].some((name) => !values[name])) {
    throw new Error('Pass --input, --output, --version, --source and --commit.');
  }

  const receipt = await prepareReleaseAssets({
    input: values.input,
    output: values.output,
    version: values.version,
    sourceCommit: values.source,
    releaseCommit: values.commit,
  });

  console.log(`Prepared ${receipt.files.length} verified release assets for ${receipt.version}.`);
}
