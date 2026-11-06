// #region Imports

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
const scope = '@pixel-brewery/wortlaut-';
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

/**
 * The product areas. A domain that is not built yet has no folder, and its route shows the empty state.
 */
const domains = [
  'start',
  'workspaces',
  'overview',
  'translations',
  'detect',
  'analyze',
  'generate',
  'transform',
  'test-lab',
  'review',
  'rules',
  'connect',
  'runs',
  'settings',
];
const builtDomains = readdirSync(join(root, 'libs/frontend/features'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const frontendLibraries = [
  ...['core', 'ui', 'shell'].map((name) => `libs/frontend/${name}`),
  ...builtDomains.map((domain) => `libs/frontend/features/${domain}`),
];
const backendLibraries = ['core', 'ai', 'engine', 'mcp', 'nx-tasks', 'eslint-rules'].map(
  (name) => `libs/backend/${name}`,
);
const applicationRoots = ['apps/cli', 'apps/desktop', 'apps/frontend/app'];

/**
 * What may sit below `src/lib` of a feature.
 */
const featureFolders = new Set([
  'components',
  'contracts',
  'provider',
  'routing',
  'services',
  'view-presenters',
  'views',
]);

/**
 * The thin roots hold exactly this.
 */
const frontendRootFiles = new Set([
  'configuration/Navigation.ts',
  'configuration/Routes.ts',
  'configuration/ShellConfig.ts',
  'index.html',
  'main.ts',
  'styles.scss',
  'views/ShellView.html',
  'views/ShellView.scss',
  'views/ShellView.ts',
]);

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

// The workspace.

assert.equal(readJson('package.json').private, true);
assert.equal(
  readJson('tsconfig.base.json').compilerOptions.paths,
  undefined,
  'Packages resolve through Yarn workspaces.',
);

for (const stale of [
  'apps/renderer',
  'libs/core',
  'libs/ai',
  'libs/engine',
  'libs/shared',
  'tools/build-node-apps.mjs',
]) {
  assert.equal(existsSync(join(root, stale)), false, `${stale} belongs somewhere else now.`);
}

// `libs/contracts` is the one typed contract that crosses main and renderer.

assert.ok(existsSync(join(root, 'libs/contracts/src/Index.ts')), 'libs/contracts');
assert.equal(readJson('libs/contracts/project.json').name, 'wortlaut-contracts');

// Backend libraries keep the names they are published under.

for (const path of backendLibraries) {
  const manifest = readJson(`${path}/package.json`);
  const project = readJson(`${path}/project.json`);

  assert.equal(manifest.name, `${scope}${path.split('/').at(-1)}`, path);
  assert.equal(project.name, `wortlaut-${path.split('/').at(-1)}`, path);
  assert.ok(existsSync(join(root, path, 'src/Index.ts')), path);
}

// Frontend libraries.

for (const domain of builtDomains) {
  assert.ok(domains.includes(domain), `${domain} is no product area.`);
}

for (const path of frontendLibraries) {
  const manifest = readJson(`${path}/package.json`);
  const project = readJson(`${path}/project.json`);
  const isFeature = path.includes('/features/');
  const name = path.split('/').at(-1);

  assert.equal(manifest.private, true, path);
  assert.equal(manifest.type, 'module', path);
  assert.equal(manifest.name, `${scope}frontend-${isFeature ? 'feature-' : ''}${name}`, path);
  assert.equal(project.name, `frontend-${isFeature ? 'feature-' : ''}${name}`, path);
  assert.equal(
    readJson(`${path}/tsconfig.lib.json`).compilerOptions.emitDeclarationOnly,
    true,
    path,
  );

  for (const target of ['build', 'lint', 'typecheck']) {
    assert.ok(project.targets[target], `${path}: ${target}`);
  }

  for (const file of ['src/index.ts', 'tsconfig.json']) {
    assert.ok(existsSync(join(root, path, file)), `${path}: ${file}`);
  }

  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
    if (dependency.startsWith(scope)) {
      assert.match(
        version,
        /^workspace:/,
        `${path}: ${dependency} must be the workspace's own package.`,
      );
      assert.ok(
        realpathSync(join(root, 'node_modules', dependency)).startsWith(root),
        `${path}: ${dependency} must lie in this workspace.`,
      );
    }
  }

  if (isFeature) {
    for (const entry of readdirSync(join(root, path, 'src/lib'), { withFileTypes: true })) {
      assert.ok(
        entry.isDirectory() && featureFolders.has(entry.name),
        `${path}: src/lib/${entry.name} is not part of the layout of a feature.`,
      );
    }

    for (const required of ['routing', 'view-presenters', 'views']) {
      assert.ok(existsSync(join(root, path, 'src/lib', required)), `${path}: src/lib/${required}`);
    }
  }
}

// The application roots stay thin.

for (const path of applicationRoots) {
  assert.ok(existsSync(join(root, path, 'project.json')), path);
}

const frontendSource = join(root, 'apps/frontend/app/src');

for (const file of listFiles(frontendSource)) {
  const name = relative(frontendSource, file).split('\\').join('/');

  assert.ok(frontendRootFiles.has(name), `apps/frontend/app/src/${name} belongs into a library.`);
}

assert.ok(existsSync(join(root, 'apps/desktop/tools/build.mjs')), 'apps/desktop/tools/build.mjs');
assert.equal(
  readJson('apps/desktop/project.json').targets.build.options.command,
  'node apps/desktop/tools/build.mjs',
);

// Imports point down, across the runtime boundary only through the contracts.

/**
 * Says what a source may import from this workspace.
 */
function allowedImports(path) {
  if (path.startsWith('libs/contracts/')) {
    return () => false;
  }

  if (path.startsWith('libs/backend/core/')) {
    return (name) => name === 'core';
  }

  if (path.startsWith('libs/backend/ai/')) {
    return (name) => ['ai', 'core'].includes(name);
  }

  if (path.startsWith('libs/backend/engine/')) {
    return (name) => ['ai', 'contracts', 'core', 'engine'].includes(name);
  }

  if (path.startsWith('libs/backend/mcp/')) {
    return (name) => ['contracts', 'engine', 'mcp'].includes(name);
  }

  if (path.startsWith('libs/backend/nx-tasks/')) {
    return (name) => ['app', 'nx-tasks'].includes(name);
  }

  if (path.startsWith('libs/backend/eslint-rules/')) {
    return (name) => ['core', 'eslint-rules'].includes(name);
  }

  if (path.startsWith('apps/cli/')) {
    return (name) => ['ai', 'app', 'contracts', 'core', 'engine', 'mcp'].includes(name);
  }

  if (path.startsWith('apps/desktop/')) {
    return (name) => ['ai', 'contracts', 'engine', 'mcp'].includes(name);
  }

  if (path.startsWith('libs/frontend/core/')) {
    return (name) => ['contracts', 'frontend-core'].includes(name);
  }

  if (path.startsWith('libs/frontend/ui/')) {
    return (name) => ['contracts', 'frontend-core', 'frontend-ui'].includes(name);
  }

  if (path.startsWith('libs/frontend/shell/')) {
    return (name) => ['contracts', 'frontend-core', 'frontend-shell', 'frontend-ui'].includes(name);
  }

  if (path.startsWith('libs/frontend/features/')) {
    return (name) =>
      ['contracts', 'frontend-core', 'frontend-ui'].includes(name) ||
      name.startsWith('frontend-feature-');
  }

  return (name) => name.startsWith('frontend-');
}

const isFrontend = (path) => path.startsWith('libs/frontend/') || path.startsWith('apps/frontend/');
let sourceFiles = 0;

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'out', '.cache', '.angular'].includes(entry.name)) {
      continue;
    }

    const path = join(directory, entry.name);
    const name = relative(root, path).split('\\').join('/');

    if (entry.isDirectory()) {
      inspect(path);
    } else if (entry.name.endsWith('.html')) {
      assert.doesNotMatch(
        readFileSync(path, 'utf8'),
        /<mosaik-stack\b/,
        `${name}: layout is native CSS, never mosaik-stack.`,
      );
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      sourceFiles += 1;

      const text = readFileSync(path, 'utf8');
      const isSpec = entry.name.endsWith('.spec.ts');
      const allowed = allowedImports(name);

      for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const specifier = match[1];

        if (specifier.startsWith(scope)) {
          const dependency = specifier.slice(scope.length);

          assert.ok(
            allowed(dependency) || (isSpec && name.startsWith('libs/frontend/')),
            `${name}: may not import ${specifier}.`,
          );
          assert.ok(
            !dependency.includes('/'),
            `${name}: ${specifier} reaches past the public export of its package.`,
          );
        }

        if (name.startsWith('libs/frontend/features/')) {
          assert.ok(
            !/^\.\.\/\.\.\/\.\.\/\.\./.test(specifier),
            `${name}: ${specifier} leaves its feature.`,
          );
        }

        if (isFrontend(name)) {
          assert.ok(
            specifier !== 'electron' && !specifier.startsWith('node:'),
            `${name}: the renderer reaches the system only through typed IPC.`,
          );

          if (specifier === `${scope}contracts` && !isSpec) {
            assert.match(
              match.input.slice(0, match.index + match[0].length),
              /import type [^;]*$/,
              `${name}: the renderer holds only the types of the contracts.`,
            );
          }
        }

        if (name.startsWith('libs/backend/') || name.startsWith('libs/contracts/')) {
          assert.ok(
            specifier !== 'electron' && !specifier.startsWith('@angular/'),
            `${name}: the libraries below the surfaces import neither Electron nor Angular.`,
          );
        }
      }
    }
  }
}

inspect(join(root, 'libs'));
inspect(join(root, 'apps'));

console.log(
  `Structure check passed: ${backendLibraries.length + frontendLibraries.length + 1} libraries (${builtDomains.length} of ${domains.length} feature domains built), ${applicationRoots.length} application roots, ${sourceFiles} TypeScript sources.`,
);
