// #region Imports

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

/**
 * The root of the repository, so the build runs from anywhere.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * What the bundles may leave to the runtime: Electron itself and Node's own modules.
 */
const runtime = new Set([
  'electron',
  ...builtinModules.flatMap((name) => [name, `node:${name.replace(/^node:/u, '')}`]),
]);

/**
 * Each bundle runs in its own process. The preload runs sandboxed, where only `electron` can be required.
 */
const bundles = [
  {
    entryPoint: 'apps/desktop/src/main.ts',
    outfile: 'dist/apps/desktop/main.cjs',
    external: ['electron'],
    allowed: runtime,
  },
  {
    entryPoint: 'apps/desktop/src/preload.ts',
    outfile: 'dist/apps/desktop/preload.cjs',
    external: ['electron'],
    allowed: new Set(['electron']),
  },
];

for (const bundle of bundles) {
  await mkdir(dirname(resolve(root, bundle.outfile)), { recursive: true });

  const result = await build({
    absWorkingDir: root,
    entryPoints: [bundle.entryPoint],
    outfile: bundle.outfile,
    bundle: true,
    metafile: true,
    format: 'cjs',
    platform: 'node',
    // Some packages, such as jsonc-parser, publish a UMD build as `main` that cannot be bundled.
    mainFields: ['module', 'main'],
    target: 'node24',
    sourcemap: true,
    legalComments: 'none',
    external: bundle.external,
    logLevel: 'warning',
  });
  // A bundled package may probe for an optional one with `require.resolve`, which needs nothing at runtime.
  const imports = Object.values(result.metafile.outputs).flatMap((output) =>
    output.imports
      .filter((entry) => entry.external && entry.kind !== 'require-resolve')
      .map((entry) => entry.path),
  );
  const unexpected = [...new Set(imports)].filter((path) => !bundle.allowed.has(path));

  if (unexpected.length > 0) {
    throw new Error(
      `The bundle ${bundle.outfile} leaves packages to the runtime that were not declared: ${unexpected.join(', ')}`,
    );
  }
}
