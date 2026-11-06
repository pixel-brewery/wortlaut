// #region Imports

import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ILogger } from '@pixel-brewery/utilities';
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { McpLevelStore } from '@pixel-brewery/wortlaut-mcp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asksForMcpServer } from './McpCommand';

// #endregion

/**
 * The built command, because this is what a client starts.
 */
const CLI = join(__dirname, '../../../dist/bin/wortlaut.js');

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;

/**
 * An obvious test value. It stands for a key in the environment of the server.
 */
const ENV_KEY = 'test-key-from-the-environment';

/**
 * An obvious test value. It stands for a key someone wrote into a configuration file.
 */
const FILE_KEY = 'test-key-from-a-file';

describe('wortlaut mcp', () => {
  let root: string;
  let repository: string;
  let profile: string;
  let fakeBin: string;
  let engine: WortlautEngine;
  let clients: Array<Client>;

  const write = (path: string, content: unknown): void => {
    const file = join(repository, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    );
  };
  const read = (path: string): string => readFileSync(join(repository, path), 'utf8');
  const environment = (): Record<string, string> => ({
    PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
    HOME: root,
    WORTLAUT_HOME: profile,
    OPENAI_API_KEY: ENV_KEY,
  });

  /**
   * Connects the client of the SDK to the built command over real stdio.
   */
  async function connect(
    options: { args?: Array<string>; cwd?: string; name?: string } = {},
  ): Promise<Client> {
    const client = new Client({ name: options.name ?? 'spec-client', version: '1.0.0' });

    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI, 'mcp', ...(options.args ?? [])],
        cwd: options.cwd ?? repository,
        env: environment(),
        stderr: 'ignore',
      }),
    );
    clients.push(client);

    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ isError: boolean; text: string; json: any }> {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    const text = result.content[0].text;
    let json: unknown = null;

    try {
      json = JSON.parse(text);
    } catch {
      // A refusal is a sentence.
    }

    return { isError: result.isError === true, text, json };
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-mcp-')));
    repository = join(root, 'shop');
    profile = join(root, 'profile');
    fakeBin = join(root, 'bin');
    clients = [];
    write('wortlaut.config.json', {
      actions: {
        detect: {
          root: 'src',
          resourceRoot: ['i18n'],
          preset: 'angular',
          type: 'json',
          resourceKey: { prefix: 'loc' },
        },
        analyze: { baseLocale: 'en' },
        generate: { locales: ['de'], apiKey: FILE_KEY },
      },
    });
    write('src/i18n/lang.en.json', { loc: { hello: 'Hello {0}', bye: 'Bye', open: 'Open' } });
    write('src/i18n/lang.de.json', { loc: { open: 'Öffnen' } });
    write('src/app.html', "<p>{{ 'Keep editing' | translate }}</p>");
    engine = new WortlautEngine({
      surface: 'desktop',
      logger: LOGGER,
      profileRoot: profile,
      home: root,
      env: {},
    });
    engine.workspaces.register({
      inspection: engine.inspector.inspect(repository),
      workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
      preset: 'angular',
      baseLocale: 'en',
      targetLocales: ['de'],
    });

    // An assistant or a provider that gets started leaves a mark.
    mkdirSync(fakeBin);

    for (const name of ['claude', 'codex', 'opencode', 'gemini']) {
      writeFileSync(
        join(fakeBin, name),
        `#!/bin/sh\necho started > ${JSON.stringify(join(root, `started-${name}`))}\n`,
      );
      chmodSync(join(fakeBin, name), 0o755);
    }
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    rmSync(root, { recursive: true, force: true });
  });

  it('is told apart from its help, which is a normal command', () => {
    // act and assert
    expect(asksForMcpServer(['node', 'wortlaut', 'mcp'])).toBe(true);
    expect(asksForMcpServer(['node', 'wortlaut', 'mcp', '--help'])).toBe(false);
    expect(asksForMcpServer(['node', 'wortlaut', 'sort'])).toBe(false);
  });

  it.each([
    [null, 7],
    ['read', 7],
    ['propose', 9],
    ['write', 12],
  ] as const)('lists the tools of the level %s over real stdio', async (level, count) => {
    // arrange
    if (level) {
      new McpLevelStore(profile).write(level);
    }

    const client = await connect();

    // act
    const { tools } = await client.listTools();

    // assert
    expect(tools).toHaveLength(count);
  });

  it('is read only without a known project, and says so', async () => {
    // arrange
    const empty = join(root, 'empty-profile');

    new McpLevelStore(empty).write('write');
    profile = empty;

    const client = await connect({ cwd: root });

    // act
    const { tools } = await client.listTools();
    const projects = await call(client, 'list_projects');
    const sort = await call(client, 'sort');
    const config = await call(client, 'get_config');

    // assert
    expect(tools).toHaveLength(7);
    expect(projects.json.projects).toEqual([]);
    expect(projects.json.note).toContain('read only');
    expect(sort.isError).toBe(true);
    expect(config.isError).toBe(true);
    expect(config.text).toContain('belongs to no project');
  });

  it('widens no level through an argument of the server', async () => {
    // arrange
    const catalog = read('src/i18n/lang.en.json');
    const client = await connect({
      args: ['--level', 'write', '--level=write', '--dry-run=false', `--cwd=${root}`],
      name: 'wortlaut-app',
    });

    // act
    const { tools } = await client.listTools();
    const sort = await call(client, 'sort', { order: 'asc' });

    // assert
    expect(tools).toHaveLength(7);
    expect(sort.isError).toBe(true);
    expect(sort.text).toContain('sort needs the level Write');
    expect(read('src/i18n/lang.en.json')).toBe(catalog);
  });

  it('proves the end state: a proposal appears in the review list, the catalog stays, and approval writes it', async () => {
    // arrange
    new McpLevelStore(profile).write('propose');

    const client = await connect({ name: 'codex-mcp-client' });
    const catalog = read('src/i18n/lang.de.json');

    // act
    const next = await call(client, 'next_translations', { locale: 'de', limit: 2 });
    const proposal = await call(client, 'propose_translations', {
      locale: 'de',
      rows: next.json.keys.map((key: { key: string; base: string }) => ({
        key: key.key,
        value: `[de] ${key.base}`,
      })),
    });
    const again = await call(client, 'next_translations', { locale: 'de' });

    // assert: it waits for review
    expect(next.json.keys.map((key: { key: string }) => key.key)).toEqual(['loc.hello', 'loc.bye']);
    expect(proposal.json).toMatchObject({ state: 'pending', accepted: 2, rejected: [] });
    expect(again.json.keys).toEqual([]);
    expect(again.json.waitingInReview).toBe(2);
    expect(read('src/i18n/lang.de.json')).toBe(catalog);
    expect(engine.listChangeSets().map((changeSet) => changeSet.id)).toEqual([
      proposal.json.changeSetId,
    ]);
    expect(engine.review.list(engine.workspaces.all()[0].id)[0]).toMatchObject({
      command: 'translations.propose',
      surface: 'mcp',
    });

    // act: the user approves it in the app
    await engine.applyChangeSet(proposal.json.changeSetId, repository);

    const done = await call(client, 'next_translations', { locale: 'de' });

    // assert
    expect(JSON.parse(read('src/i18n/lang.de.json'))).toEqual({
      loc: { open: 'Öffnen', hello: '[de] Hello {0}', bye: '[de] Bye' },
    });
    expect(done.json.keys).toEqual([]);
    expect(done.json.waitingInReview).toBe(0);
    expect(
      engine.projects.mcpActivity(10).map((entry) => [entry.tool, entry.client]),
    ).toContainEqual(['propose_translations', 'Codex']);
  });

  it('uses the check of Approve in apply_changes: a file that changed fails, is named, and nothing is written', async () => {
    // arrange
    new McpLevelStore(profile).write('write');

    const client = await connect();
    const proposal = await call(client, 'propose_translations', {
      locale: 'de',
      rows: [{ key: 'loc.bye', value: 'Tschüss' }],
    });
    const dryRun = await call(client, 'apply_changes', {
      id: proposal.json.changeSetId,
      dryRun: true,
    });

    write('src/i18n/lang.de.json', { loc: { open: 'Changed by someone else' } });

    // act
    const conflict = await call(client, 'apply_changes', { id: proposal.json.changeSetId });

    write('src/i18n/lang.de.json', { loc: { open: 'Öffnen' } });

    // assert
    expect(dryRun.json).toMatchObject({
      dryRun: true,
      conflicts: [],
      wouldWrite: ['src/i18n/lang.de.json'],
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.text).toContain('src/i18n/lang.de.json changed since');
    expect(engine.listChangeSets()).toHaveLength(1);
  });

  it('writes at the level Write, without a look at any switch of the app, and a real dry run writes nothing', async () => {
    // arrange
    new McpLevelStore(profile).write('write');

    const client = await connect();
    const before = read('src/i18n/lang.en.json');

    // act
    const dryRun = await call(client, 'sort', { order: 'asc', dryRun: true });
    const untouched = read('src/i18n/lang.en.json');
    const sorted = await call(client, 'sort', { order: 'asc' });

    // assert
    expect(dryRun.json).toMatchObject({ dryRun: true, state: 'unchanged' });
    expect(untouched).toBe(before);
    expect(sorted.json.state).toBe('applied');
    expect(Object.keys(JSON.parse(read('src/i18n/lang.en.json')).loc)).toEqual([
      'bye',
      'hello',
      'open',
    ]);
    expect(
      engine.runs.list().find((run) => run.assistant?.tool === 'sort' && !run.dryRun)?.surface,
    ).toBe('mcp');
  });

  it('starts no provider and no assistant, and hands out no key, whatever a tool is asked', async () => {
    // arrange
    new McpLevelStore(profile).write('write');

    const client = await connect();
    const texts = new Array<string>();

    // act
    for (const [name, args] of [
      ['list_projects', {}],
      ['get_config', {}],
      ['search_keys', { query: 'o' }],
      ['detect', {}],
      ['analyze', {}],
      ['test_pattern', { pattern: 'loc.*' }],
      ['next_translations', { locale: 'de' }],
      ['propose_translations', { locale: 'de', rows: [{ key: 'loc.bye', value: 'Tschüss' }] }],
      ['transform', { types: ['po'], dryRun: true }],
      ['sort', { dryRun: true }],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop
      texts.push((await call(client, name, args as Record<string, unknown>)).text);
    }

    // assert
    for (const name of ['claude', 'codex', 'opencode', 'gemini']) {
      expect(existsSync(join(root, `started-${name}`))).toBe(false);
    }

    expect(existsSync(join(profile, 'assistants'))).toBe(false);

    for (const text of texts) {
      expect(text).not.toContain(ENV_KEY);
      expect(text).not.toContain(FILE_KEY);
    }
  });

  it('keeps stdout for the protocol: even code that prints during a tool cannot reach it', async () => {
    // arrange
    new McpLevelStore(profile).write('write');

    const noisy = join(root, 'noisy.cjs');

    // This stands in for any code a tool reaches that logs: it prints all the time the server runs.
    writeFileSync(
      noisy,
      'setInterval(() => { console.log("stray console line"); console.info("stray info line"); process.stdout.write("stray write\\n"); }, 2).unref();\n',
    );

    const child = spawn(process.execPath, ['--require', noisy, CLI, 'mcp'], {
      cwd: repository,
      env: environment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const lines = (): Array<string> => stdout.split('\n').filter((line) => line.length > 0);
    const send = async (id: number, method: string, params: unknown): Promise<void> => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);

      for (
        let wait = 0;
        wait < 400 &&
        !lines().some((line) => line.includes(`"id":${id},`) || line.includes(`"id":${id}}`));
        wait++
      ) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    };

    // act
    await send(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'raw', version: '1' },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    await send(2, 'tools/list', {});

    let id = 3;

    for (const [name, args] of [
      ['list_projects', {}],
      ['detect', {}],
      ['analyze', {}],
      ['next_translations', { locale: 'de' }],
      ['propose_translations', { locale: 'de', rows: [{ key: 'loc.bye', value: 'Tschüss' }] }],
      ['transform', { dryRun: true }],
      ['sort', { dryRun: true }],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop
      await send(id++, 'tools/call', { name, arguments: args });
    }

    child.stdin.end();
    await new Promise((resolve) => {
      child.once('exit', resolve);
    });

    // assert
    const answered = lines().map((line) => JSON.parse(line) as { jsonrpc: string; id: number });

    expect(answered.map((message) => message.jsonrpc)).toEqual(answered.map(() => '2.0'));
    expect(answered.map((message) => message.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(stdout).not.toContain('stray');
    expect(stderr).toContain('stray console line');
    expect(child.exitCode).toBe(0);
  }, 60_000);

  it('ends when its client goes away, and prints nothing to stdout at the end', async () => {
    // arrange
    const child = spawn(process.execPath, [CLI, 'mcp'], {
      cwd: repository,
      env: environment(),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let stdout = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    // act
    child.stdin.end();
    await new Promise((resolve) => {
      child.once('exit', resolve);
    });

    // assert
    expect(child.exitCode).toBe(0);
    expect(stdout).toBe('');
  }, 30_000);
});
