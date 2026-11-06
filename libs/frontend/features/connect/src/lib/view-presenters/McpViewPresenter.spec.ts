// #region Imports

import { TestBed } from '@angular/core/testing';
import type {
  IpcEvent,
  McpActivity,
  McpClient,
  McpLevel,
  McpStatus,
  McpTool,
} from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpViewPresenter } from './McpViewPresenter';

// #endregion

const TOOLS: Array<McpTool> = [
  { id: 'detect', description: 'Finds hard-coded strings, without writing.', level: 'read' },
  { id: 'propose_keys', description: 'Suggests keys for hard-coded strings.', level: 'propose' },
  { id: 'sort', description: 'Sorts the keys in catalogs.', level: 'write' },
];
const CLIENTS: Array<McpClient> = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    state: 'Installed',
    variant: 'neutral',
    about: 'The plugin.',
    steps: [{ title: 'Add the MCP server', code: 'claude mcp add wortlaut -- node cli.js mcp' }],
  },
  {
    id: 'codex',
    label: 'Codex',
    state: 'Connected',
    variant: 'success',
    about: 'The same.',
    steps: [{ title: 'Add the MCP server', code: 'codex mcp add wortlaut -- node cli.js mcp' }],
  },
];

function setUp(
  options: { level?: McpLevel; activity?: Array<McpActivity>; failSet?: boolean } = {},
) {
  let listener: (event: IpcEvent) => void = () => undefined;
  let level: McpLevel = options.level ?? 'read';
  const status = (): McpStatus => ({
    level,
    command: 'node cli.js mcp',
    ready: true,
    problem: null,
  });
  const request = vi.fn((method: string, payload: unknown): Promise<unknown> => {
    switch (method) {
      case 'mcp.status':
        return Promise.resolve(status());
      case 'mcp.setLevel':
        if (options.failSet) {
          return Promise.reject(new Error('The profile cannot be written.'));
        }

        level = (payload as { level: McpLevel }).level;

        return Promise.resolve(status());
      case 'mcp.clients':
        return Promise.resolve(CLIENTS);
      case 'mcp.tools':
        return Promise.resolve(TOOLS);
      case 'mcp.activity':
        return Promise.resolve(options.activity ?? []);
      case 'run.active':
        return Promise.resolve([]);
      default:
        return Promise.resolve({});
    }
  });

  TestBed.configureTestingModule({
    providers: [
      McpViewPresenter,
      {
        provide: DesktopApi,
        useValue: {
          request,
          onEvent: (handler: (event: IpcEvent) => void) => {
            listener = handler;

            return () => undefined;
          },
        },
      },
    ],
  });

  return {
    presenter: TestBed.inject(McpViewPresenter),
    request,
    emit: (event: IpcEvent) => listener(event),
  };
}

describe('McpViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it.each([
    [
      'read',
      '1 of 3 available',
      [true, false, false],
      'Assistants can look and check. They cannot change anything.',
    ],
    [
      'propose',
      '2 of 3 available',
      [true, true, false],
      'Assistants can look, check and suggest. Suggestions wait in the review list until you approve them.',
    ],
    [
      'write',
      '3 of 3 available',
      [true, true, true],
      'Assistants can also write to catalogs: they approve their own changes. Every change still appears in Runs.',
    ],
  ] as const)(
    'at %s it says what is available and dims the rest',
    async (level, count, available, text) => {
      // arrange
      const { presenter } = setUp({ level });

      // act
      await presenter.load();

      // assert
      expect(presenter.availability()).toBe(count);
      expect(presenter.toolRows().map((row) => row.isAvailable)).toEqual(available);
      expect(presenter.levelText()).toBe(text);
      expect(presenter.levels().find((choice) => choice.isChecked)?.id).toBe(level);
    },
  );

  it('stores a new level, which the server reads for its next call', async () => {
    // arrange
    const { presenter, request } = setUp();

    await presenter.load();

    // act
    await presenter.setLevel('write');

    // assert
    expect(request).toHaveBeenCalledWith('mcp.setLevel', { level: 'write' });
    expect(presenter.availability()).toBe('3 of 3 available');
  });

  it('asks nothing for the level that is already set', async () => {
    // arrange
    const { presenter, request } = setUp({ level: 'propose' });

    await presenter.load();

    // act
    await presenter.setLevel('propose');

    // assert
    expect(request).not.toHaveBeenCalledWith('mcp.setLevel', expect.anything());
  });

  it('says why a level could not be stored, and keeps the one it has', async () => {
    // arrange
    const { presenter } = setUp({ failSet: true });

    await presenter.load();

    // act
    await presenter.setLevel('write');

    // assert
    expect(presenter.message()).toBe('The profile cannot be written.');
    expect(presenter.availability()).toBe('1 of 3 available');
  });

  it('opens the steps of an assistant', async () => {
    // arrange
    const { presenter } = setUp();

    await presenter.load();

    // act
    const before = presenter.client()?.id;

    presenter.pickClient('codex');

    // assert
    expect(before).toBe('claude-code');
    expect(presenter.client()?.state).toBe('Connected');
    expect(presenter.clientTabs().map((tab) => tab.isSelected)).toEqual([false, true]);
  });

  it('copies a step and says so for a moment', async () => {
    // arrange
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const { presenter, request } = setUp();

    await presenter.load();

    // act
    await presenter.copy('claude mcp add wortlaut -- node cli.js mcp');

    const copied = presenter.copied();

    vi.advanceTimersByTime(2000);

    // assert
    expect(request).toHaveBeenCalledWith('clipboard.writeText', {
      text: 'claude mcp add wortlaut -- node cli.js mcp',
    });
    expect(copied).toBe('claude mcp add wortlaut -- node cli.js mcp');
    expect(presenter.copied()).toBeNull();
  });

  it('shows what an assistant did', async () => {
    // arrange
    const { presenter } = setUp({
      activity: [
        {
          runId: 'r1',
          tool: 'propose_translations',
          client: 'Codex',
          result: '2 keys, waiting for review',
          state: 'succeeded',
          startedAt: new Date(Date.now() - 240_000).toISOString(),
        },
      ],
    });

    // act
    await presenter.load();

    // assert
    expect(presenter.activityRows()).toEqual([
      {
        id: 'r1',
        tool: 'propose_translations',
        when: '4 min ago',
        line: 'Codex · 2 keys, waiting for review',
      },
    ]);
  });

  it('reads the activity again when another process recorded a run', async () => {
    // arrange
    const { presenter, request, emit } = setUp();

    await presenter.load();
    request.mockClear();

    // act
    emit({ type: 'runs.updated' });
    TestBed.tick();

    // assert
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('mcp.activity', { limit: 8 }));
    expect(request).toHaveBeenCalledWith('mcp.clients', {});
  });

  it('holds no path and no secret of its own: everything it shows comes from main', async () => {
    // arrange
    const { presenter, request } = setUp();

    // act
    await presenter.load();

    // assert
    expect(request.mock.calls.map(([method]) => method).sort()).toEqual([
      'mcp.activity',
      'mcp.clients',
      'mcp.status',
      'mcp.tools',
      'run.active',
    ]);
  });
});
