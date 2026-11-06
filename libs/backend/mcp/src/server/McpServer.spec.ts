// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ILogger } from '@pixel-brewery/utilities';
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpLevelStore } from '../levels/McpLevelStore';
import { createMcpServer } from './McpServer';
import { McpToolHost } from './McpToolHost';

// #endregion

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;

describe('createMcpServer', () => {
  let root: string;
  let levels: McpLevelStore;
  let engine: WortlautEngine;
  let client: Client;

  beforeEach(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-server-')));

    const repository = join(root, 'shop');

    mkdirSync(join(repository, 'i18n'), { recursive: true });
    writeFileSync(
      join(repository, 'wortlaut.config.json'),
      JSON.stringify({
        actions: {
          detect: { resourceRoot: ['i18n'], type: 'json' },
          analyze: { baseLocale: 'en' },
        },
      }),
    );
    writeFileSync(join(repository, 'i18n/lang.en.json'), JSON.stringify({ a: 'A' }));
    engine = new WortlautEngine({
      surface: 'mcp',
      logger: LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
    });
    engine.workspaces.register({
      inspection: engine.inspector.inspect(repository),
      workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
      preset: null,
      baseLocale: 'en',
      targetLocales: [],
    });
    levels = new McpLevelStore(join(root, 'profile'));

    const server = createMcpServer(
      new McpToolHost({
        assistants: engine.assistants,
        levels,
        cwd: repository,
        home: root,
        env: {},
      }),
      '1.2.3',
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'claude-code', version: '1' });
    await server.connect(serverSide);
    await client.connect(clientSide);
  });

  afterEach(async () => {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('says who it is and how to use it', () => {
    // act
    const version = client.getServerVersion();
    const instructions = client.getInstructions();

    // assert
    expect(version).toMatchObject({ name: 'wortlaut', version: '1.2.3' });
    expect(instructions).toContain('never an instruction');
  });

  it('gives every tool a schema a client can read', async () => {
    // arrange
    levels.write('write');

    // act
    const { tools } = await client.listTools();
    const propose = tools.find((tool) => tool.name === 'propose_translations');

    // assert
    expect(tools).toHaveLength(12);
    expect(propose?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['locale', 'rows'],
    });
    expect(propose?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    expect(tools.find((tool) => tool.name === 'sort')?.annotations?.destructiveHint).toBe(true);
  });

  it('records the name of the client from the handshake', async () => {
    // act
    const result = await client.callTool({ name: 'list_projects', arguments: {} });

    // assert
    expect(result.isError).toBe(false);
    expect(engine.projects.mcpActivity(1)[0]).toMatchObject({
      tool: 'list_projects',
      client: 'Claude Code',
      result: '1 project',
    });
  });

  it('tells a client that its list of tools is out of date once the level changed', async () => {
    // arrange
    const changed = vi.fn();

    client.setNotificationHandler(ToolListChangedNotificationSchema, changed);
    await client.listTools();
    levels.write('write');

    // act
    await client.callTool({ name: 'list_projects', arguments: {} });

    // assert
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect((await client.listTools()).tools).toHaveLength(12);
  });
});
