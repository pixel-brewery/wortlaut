// #region Imports

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// #endregion

/**
 * Verifies that a GitHub release exposes every artifact advertised by a version manifest.
 *
 * @param {unknown} manifest Version manifest generated for the update origin.
 * @param {unknown} release GitHub Releases API response for the stable tag or its unfinished draft.
 * @param {{ allowMissing?: boolean }} options Permit missing assets only while resuming an unfinished draft.
 * @returns {string[]} Human-readable verification failures.
 * @public
 */
export function verifyReleaseAssets(manifest, release, { allowMissing = false } = {}) {
  const failures = [];
  if (typeof release?.draft !== 'boolean' || release?.prerelease !== false)
    failures.push('Only a stable release or its unfinished draft may be resumed.');
  if (
    manifest?.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/u.test(manifest?.sourceCommit ?? '') ||
    !/^[a-f0-9]{40}$/u.test(manifest?.releaseCommit ?? '')
  )
    failures.push('The publication receipt must identify exact source and release commits.');
  const version = isRecord(manifest) ? manifest['version'] : undefined;
  const files = isRecord(manifest) && Array.isArray(manifest['files']) ? manifest['files'] : [];
  const tagName = isRecord(release) ? release['tag_name'] : undefined;
  const draftAssetBaseUrl = draftReleaseAssetBaseUrl(release);
  if (allowMissing && release?.draft !== true)
    failures.push('Missing assets are permitted only in an unpublished draft.');
  const assets = isRecord(release) && Array.isArray(release['assets']) ? release['assets'] : [];
  const advertisedNames = new Set(
    files
      .filter((candidate) => isRecord(candidate) && typeof candidate['name'] === 'string')
      .map((candidate) => candidate['name']),
  );

  if (typeof version !== 'string' || version.trim() === '') {
    failures.push('The version manifest must identify its release version.');
  } else if (tagName !== `v${version}`) {
    failures.push(`The GitHub release tag ${String(tagName)} does not match version ${version}.`);
  }
  const expectedNames = new Set([
    `Wortlaut-darwin-arm64-${version}.dmg`,
    `Wortlaut-win32-x64-${version}.exe`,
    'SHA256SUMS.txt',
  ]);
  if (
    files.length !== 3 ||
    advertisedNames.size !== 3 ||
    [...expectedNames].some((name) => !advertisedNames.has(name))
  )
    failures.push(
      'The release must contain exactly the two supported installers and their checksums.',
    );

  for (const candidate of files) {
    if (!isRecord(candidate) || typeof candidate['name'] !== 'string') {
      failures.push('The version manifest contains an invalid release artifact.');
      continue;
    }

    const name = candidate['name'];
    if (
      !Number.isSafeInteger(candidate.bytes) ||
      candidate.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(candidate.sha256 ?? '') ||
      candidate.url !==
        `https://github.com/pixel-brewery/wortlaut/releases/download/v${version}/${encodeURIComponent(name)}`
    )
      failures.push('The publication receipt contains an invalid asset descriptor.');
    const matchingAssets = assets.filter((asset) => isRecord(asset) && asset['name'] === name);
    if (matchingAssets.length === 0 && allowMissing) continue;
    if (matchingAssets.length !== 1) {
      failures.push(`GitHub must publish exactly one release asset named ${name}.`);
      continue;
    }

    const asset = matchingAssets[0];
    if (!isRecord(asset)) continue;
    if (asset['state'] !== 'uploaded') {
      failures.push(`GitHub release asset ${name} is not fully uploaded.`);
    }
    if (asset['size'] !== candidate['bytes']) {
      failures.push(`GitHub release asset ${name} has an unexpected byte count.`);
    }
    if (asset['digest'] !== `sha256:${String(candidate['sha256'])}`) {
      failures.push(`GitHub release asset ${name} has an unexpected SHA-256 digest.`);
    }
    if (
      asset['browser_download_url'] !== candidate['url'] &&
      (draftAssetBaseUrl === undefined ||
        asset['browser_download_url'] !== `${draftAssetBaseUrl}/${encodeURIComponent(name)}`)
    ) {
      failures.push(`GitHub release asset ${name} does not match its advertised URL.`);
    }
  }

  for (const asset of assets) {
    if (!isRecord(asset) || typeof asset['name'] !== 'string') continue;
    if (!advertisedNames.has(asset['name'])) {
      failures.push(`GitHub release asset ${asset['name']} is not part of the release manifest.`);
    }
  }

  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [manifestPath, releasePath, mode] = process.argv.slice(2);
  if (mode !== undefined && mode !== '--allow-missing')
    throw new Error('Unsupported asset verification mode.');
  if (!manifestPath || !releasePath) {
    throw new Error('Expected paths to a version manifest and GitHub release response.');
  }

  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  const release = JSON.parse(readFileSync(resolve(releasePath), 'utf8'));
  const failures = verifyReleaseAssets(manifest, release, {
    allowMissing: mode === '--allow-missing',
  });

  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Verified ${manifest.files.length} published release assets.\n`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves only GitHub's exact same-repository draft slug, never a published alias. */
function draftReleaseAssetBaseUrl(release) {
  if (!isRecord(release) || release.draft !== true || typeof release.html_url !== 'string')
    return undefined;
  const match =
    /^https:\/\/github\.com\/pixel-brewery\/wortlaut\/releases\/tag\/(untagged-[a-f0-9]{20})$/u.exec(
      release.html_url,
    );
  if (match?.[0] !== release.html_url) return undefined;
  return `https://github.com/pixel-brewery/wortlaut/releases/download/${match[1]}`;
}
