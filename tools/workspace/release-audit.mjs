// #region Imports

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
// The root manifest belongs to the group for its version, and it is private.
const expected = JSON.parse(
  readFileSync(join(root, 'nx.json'), 'utf8'),
).release.groups.wortlaut.projects.filter((name) => name !== 'wortlaut');
const failures = [];
let checked = 0;

function latestOf(name) {
  try {
    return JSON.parse(
      execFileSync('yarn', ['npm', 'info', name, '--json'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )['dist-tags'].latest;
  } catch {
    return 'not published';
  }
}

for (const file of execFileSync('git', ['ls-files', '*project.json'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n')) {
  if (!expected.includes(JSON.parse(readFileSync(join(root, file), 'utf8')).name)) {
    continue;
  }

  const { name, version } = JSON.parse(
    readFileSync(join(root, dirname(file), 'package.json'), 'utf8'),
  );
  const latest = latestOf(name);

  checked++;

  if (latest === version) {
    console.log(`[release:audit] ${name}@${version}`);
  } else {
    failures.push(`${name}: GitHub Packages latest=${latest}, local=${version}`);
  }
}

if (checked !== expected.length) {
  failures.push(`Expected ${expected.length} packages, found ${checked}.`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `[release:audit] ${checked}/${expected.length} packages match their local version and latest tag.`,
);
