// #region Imports

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// #endregion

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const packages = ['contracts', 'core', 'ai', 'engine', 'mcp', 'app'];
const packageNameOf = (name) => `@pixel-brewery/wortlaut-${name}`;
const registry = 'https://npm.pkg.github.com';
const mcpTimeoutMs = 60_000;

/**
 * What the command line only imports when an assistant is first asked for something, so no other check here would miss them.
 */
const lazyModules = ['core', 'runtime', 'provider-claude', 'provider-codex', 'provider-opencode'].map((name) => `@pixel-brewery/synapse-${name}`);

/**
 * Runs a package manager. On Windows both are command scripts, which only a shell can start.
 */
function runPackageManager(command, args, cwd, env = process.env) {
  execFileSync(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' });
}

/**
 * Keeps the consumer away from everything the repository and this machine provide.
 */
function isolatedEnvironment(consumer) {
  const home = join(consumer, 'home');

  mkdirSync(home, { recursive: true });

  const env = { ...process.env, HOME: home, USERPROFILE: home, WORTLAUT_HOME: join(consumer, 'profile'), WORTLAUT_SECRET_STORE: 'memory', NODE_PATH: '' };

  delete env.NODE_OPTIONS;

  return env;
}

function packTheWorkspaces(tarballs) {
  for (const name of packages) {
    runPackageManager('yarn', ['workspace', packageNameOf(name), 'pack', '--out', join(tarballs, `${name}.tgz`)], repository);
  }
}

function copyTheTarballs(tarballs, consumer) {
  for (const name of packages) {
    copyFileSync(join(tarballs, `${name}.tgz`), join(consumer, `${name}.tgz`));
  }
}

function installWithNpm(consumer, env) {
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ name: 'wortlaut-npm-consumer', version: '0.0.0', private: true })}\n`);
  writeFileSync(join(consumer, '.npmrc'), `@pixel-brewery:registry=${registry}\n//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}\n`);
  runPackageManager('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...packages.map((name) => `./${name}.tgz`)], consumer, env);
}

function installWithYarn(consumer, env) {
  const files = Object.fromEntries(packages.map((name) => [packageNameOf(name), `file:./${name}.tgz`]));

  // The packages name each other by version, and that version only exists in the registry after the release.
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ name: 'wortlaut-yarn-consumer', version: '0.0.0', private: true, packageManager: 'yarn@4.18.1', dependencies: files, resolutions: files })}\n`);
  writeFileSync(join(consumer, 'yarn.lock'), '');
  writeFileSync(join(consumer, '.yarnrc.yml'), [
    'nodeLinker: node-modules',
    'enableScripts: false',
    'enableImmutableInstalls: false',
    'npmScopes:',
    '  pixel-brewery:',
    '    npmAlwaysAuth: true',
    '    npmAuthToken: "${NODE_AUTH_TOKEN-}"',
    '    npmMinimalAgeGate: 0',
    `    npmRegistryServer: "${registry}"`,
    ''
  ].join('\n'));
  runPackageManager('yarn', ['install'], consumer, env);
}

/**
 * Loads every entry point from inside the consumer, so nothing resolves through the repository.
 */
function loadTheEntryPoints(consumer, env) {
  const script = `
    const assert = require('node:assert/strict');
    const { realpathSync } = require('node:fs');
    const { sep } = require('node:path');
    const modules = realpathSync('node_modules') + sep;
    for (const name of ${JSON.stringify(packages)}) {
      const entry = require.resolve('${packageNameOf('')}' + name);
      assert.ok(realpathSync(entry).startsWith(modules), 'Package ' + name + ' escaped the consumer install.');
      assert.ok(Object.keys(require(entry)).length > 0, 'Package ' + name + ' exports nothing.');
    }
  `;

  execFileSync(process.execPath, ['-e', script], { cwd: consumer, env, stdio: ['ignore', 'pipe', 'inherit'] });
}

/**
 * Imports what the command line loads late. Its own status reports a failed import as the state of a provider, so it cannot tell.
 */
function loadTheLazyModules(consumer, env, manifest) {
  for (const name of lazyModules) {
    assert.ok(manifest.dependencies[name], `${manifest.name} does not depend on ${name}.`);
  }

  execFileSync(process.execPath, ['--input-type=module', '-e', lazyModules.map((name) => `await import('${name}');`).join(' ')], { cwd: consumer, env, stdio: ['ignore', 'pipe', 'inherit'] });
}

/**
 * Writes real catalogs through the installed command line.
 */
function transformARepository(consumer, cli, env) {
  const project = join(consumer, 'project');

  mkdirSync(join(project, '.git'), { recursive: true });
  mkdirSync(join(project, 'i18n'));
  writeFileSync(join(project, 'i18n', 'lang.en.json'), `${JSON.stringify({ greeting: 'Good morning' })}\n`);
  execFileSync(process.execPath, [cli, 'transform', '--cwd', project, '-rr', 'i18n', '-t', 'json', '-ts', 'ts'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  assert.match(readFileSync(join(project, 'i18n', 'lang.en.ts'), 'utf8'), /Good morning/);
}

/**
 * Asks for the providers through the installed command line.
 */
function readTheProviders(consumer, cli, env) {
  const output = execFileSync(process.execPath, [cli, 'ai', 'status', '--json', 'true'], { cwd: consumer, env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const report = JSON.parse(output.trim().split('\n').at(-1));

  assert.equal(report.ok, true, 'ai status failed.');
  assert.match(JSON.stringify(report), /claude-code/);
  assert.match(JSON.stringify(report), /opencode/);
}

/**
 * Speaks to the installed MCP server over stdio, as an assistant would.
 */
function listTheMcpTools(consumer, cli, env) {
  return new Promise((done, fail) => {
    const server = spawn(process.execPath, [cli, 'mcp'], { cwd: consumer, env, stdio: ['pipe', 'pipe', 'inherit'] });
    const timer = setTimeout(() => {
      server.kill();
      fail(new Error('The MCP server gave no answer in time.'));
    }, mcpTimeoutMs);
    const send = (message) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

    server.on('error', fail);
    server.on('exit', (code) => {
      clearTimeout(timer);

      if (code) {
        fail(new Error(`The MCP server exited with ${code}.`));
      }
    });
    createInterface({ input: server.stdout }).on('line', (line) => {
      const message = JSON.parse(line);

      if (message.id === 1) {
        send({ method: 'notifications/initialized' });
        send({ id: 2, method: 'tools/list' });
      }

      if (message.id === 2) {
        clearTimeout(timer);
        server.kill();
        assert.ok(message.result?.tools?.length > 0, 'The MCP server lists no tool.');
        done();
      }
    });
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'wortlaut-consumer-check', version: '0.0.0' } } });
  });
}

async function exercise(consumer, env) {
  const manifest = JSON.parse(readFileSync(join(consumer, 'node_modules', packageNameOf('app'), 'package.json'), 'utf8'));
  const cli = join(consumer, 'node_modules', packageNameOf('app'), manifest.bin.wortlaut);

  if (process.env.RELEASE_VERSION) {
    assert.equal(manifest.version, process.env.RELEASE_VERSION);
  }

  assert.equal(manifest.bin.localizator, manifest.bin.wortlaut);
  assert.ok(realpathSync(cli).startsWith(realpathSync(consumer) + sep), 'The command line escaped the consumer install.');
  loadTheEntryPoints(consumer, env);
  loadTheLazyModules(consumer, env, manifest);
  execFileSync(process.execPath, [cli, '--help'], { env, stdio: 'pipe' });
  transformARepository(consumer, cli, env);
  readTheProviders(consumer, cli, env);
  await listTheMcpTools(consumer, cli, env);
}

const root = mkdtempSync(join(realpathSync(process.env.RUNNER_TEMP ?? tmpdir()), 'wortlaut-consumer-'));

try {
  const tarballs = join(root, 'tarballs');

  mkdirSync(tarballs);
  packTheWorkspaces(tarballs);

  for (const [name, install] of [['npm', installWithNpm], ['yarn', installWithYarn]]) {
    const consumer = join(root, name);

    mkdirSync(consumer);
    copyTheTarballs(tarballs, consumer);

    const env = isolatedEnvironment(consumer);

    install(consumer, env);
    assert.ok(existsSync(join(consumer, 'node_modules', packageNameOf('app'))), `${name} did not install the packages.`);
    await exercise(consumer, env);
    console.log(`The six packages work in a fresh ${name} consumer: entry points, late imports, help, a transform, ai status and the MCP server.`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
