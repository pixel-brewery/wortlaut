// #region Imports

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateChunk } from '../generator/ChunkTranslator';
import { LocalAssistantResourceGeneratorStrategy } from '../generator/strategies/LocalAssistantResourceGeneratorStrategy';
import { AiProviderHost } from '../providers/AiProviderHost';
import { LocalAssistants, type ISynapseModules } from './LocalAssistants';

// #endregion

/**
 * Loads the real Synapse. The specs run it against a fake executable, so no real assistant is ever started.
 */
async function loadSynapse(): Promise<ISynapseModules> {
  const [core, runtime, claude, codex, opencode] = await Promise.all([
    import('@pixel-brewery/synapse-core'),
    import('@pixel-brewery/synapse-runtime'),
    import('@pixel-brewery/synapse-provider-claude'),
    import('@pixel-brewery/synapse-provider-codex'),
    import('@pixel-brewery/synapse-provider-opencode'),
  ]);

  return {
    AiRuntime: runtime.AiRuntime,
    NodeProcessRunner: runtime.NodeProcessRunner,
    ClaudeDriver: claude.ClaudeDriver,
    CodexDriver: codex.CodexDriver,
    OpenCodeDriver: opencode.OpenCodeDriver,
    isCleanupIncomplete: core.isCleanupIncomplete,
  };
}

// The fake assistants are scripts with a shebang, which Windows cannot start.
describe.skipIf(process.platform === 'win32')('LocalAssistants', () => {
  let root: string;
  let assistants: LocalAssistants;
  let record: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-assistants-'));
    record = join(root, 'record.json');
  });

  afterEach(async () => {
    await assistants?.dispose();
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Writes an executable that behaves like the command line of Claude Code and notes how it was called.
   */
  function fakeClaude(options: { loggedIn: boolean; answer?: string }): string {
    const file = join(root, 'claude');
    const script = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'login') { fs.writeFileSync(${JSON.stringify(`${record}.login`)}, 'called'); process.exit(1); }
const input = args[0] === 'auth' ? '' : fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, input, cwd: process.cwd(), env: { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null, CLAUDE_SECURESTORAGE_CONFIG_DIR: process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? null, HOME: process.env.HOME, SECRET: process.env.WORTLAUT_TEST_SECRET ?? null } }));
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: ${options.loggedIn}, authMethod: ${options.loggedIn ? '"claude.ai"' : '"none"'} })); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc' }));
console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { rows: ${options.answer ?? '[]'} }, session_id: 'abc', usage: { input_tokens: 7, output_tokens: 3 } }));
`;

    writeFileSync(file, script);
    chmodSync(file, 0o755);

    return file;
  }

  function create(
    locate: (command: string) => string | null,
    environment: Record<string, string | undefined> = {},
  ): LocalAssistants {
    assistants = new LocalAssistants({
      synapse: loadSynapse,
      stateRoot: join(root, 'state'),
      environment,
      home: join(root, 'home'),
      locate,
    });

    return assistants;
  }

  describe('what an assistant leaves in the profile', () => {
    const LOGIN = JSON.stringify({ token: 'login-of-the-user' });
    const PROMPT = 'Translate the secret catalog text';

    /**
     * Writes an executable that behaves like Codex: it works in the home Synapse gives it, leaves its session there and
     * refreshes its token in the copy of the login.
     */
    function fakeCodex(
      options: { failAfterRefresh?: boolean; hang?: boolean; slow?: boolean } = {},
    ): string {
      const file = join(root, 'codex');
      const script = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === 'login') { process.exit(0); }
const home = process.env.CODEX_HOME;
const input = fs.readFileSync(0, 'utf8');
let auth = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'));
fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({ home, sqlite: process.env.CODEX_SQLITE_HOME, tmp: process.env.TMPDIR, tmpExists: fs.existsSync(process.env.TMPDIR), token: auth.token }) + '\\n');
if (${Boolean(options.slow)}) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); }
fs.mkdirSync(path.join(home, 'sessions', '2026'), { recursive: true });
fs.writeFileSync(path.join(home, 'sessions', '2026', 'rollout-1.jsonl'), input);
fs.mkdirSync(process.env.CODEX_SQLITE_HOME, { recursive: true });
fs.writeFileSync(path.join(process.env.CODEX_SQLITE_HOME, 'state.sqlite'), input);
auth = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'));
fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ token: auth.token + '+refreshed' }));
if (${Boolean(options.hang)}) { setInterval(() => undefined, 1000); } else {
if (${Boolean(options.failAfterRefresh)}) { console.error('it broke'); process.exit(3); }
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'abc' }));
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ rows: [] }) } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }));
}
`;

      writeFileSync(file, script);
      chmodSync(file, 0o755);

      return file;
    }

    function login(content = LOGIN): string {
      const file = join(root, 'home', '.codex', 'auth.json');

      mkdirSync(join(root, 'home', '.codex'), { recursive: true });
      writeFileSync(file, content);

      return file;
    }

    /**
     * Lists every file below the folder of the assistant, for proving what is left.
     */
    function filesOfAssistant(): Array<string> {
      const folder = join(root, 'state', 'codex');

      return existsSync(folder)
        ? readdirSync(folder, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
        : [];
    }

    function create(executable: string, modules: Partial<ISynapseModules> = {}): LocalAssistants {
      assistants = new LocalAssistants({
        synapse: async () => ({ ...(await loadSynapse()), ...modules }),
        stateRoot: join(root, 'state'),
        environment: {},
        home: join(root, 'home'),
        locate: () => executable,
      });

      return assistants;
    }

    const turn = (signal?: AbortSignal) => ({ prompt: PROMPT, ...(signal ? { signal } : {}) });

    it('removes the copy of the login and the sessions after a run, and the refreshed token reaches the login of the user first', async () => {
      // arrange
      const file = login();

      // act
      await create(fakeCodex()).assistant('codex').run(turn());

      const seen = JSON.parse(readFileSync(record, 'utf8'));

      // assert
      expect(seen.home).toContain(join('state', 'codex', 'execution'));
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        token: 'login-of-the-user+refreshed',
      });
      expect(
        filesOfAssistant().filter((name) => name !== '.synapse-session-generation.json'),
      ).toEqual([]);
      expect(existsSync(seen.home)).toBe(false);
      expect(existsSync(seen.sqlite)).toBe(false);
      expect(seen.tmpExists).toBe(true);
    });

    it('keeps the working copy while another call of the assistant is under way, so its refresh is not lost', async () => {
      // arrange
      const file = login();
      const assistant = create(fakeCodex()).assistant('codex');

      // act
      await Promise.all([assistant.run(turn()), assistant.run(turn())]);

      const tokens = readFileSync(record, 'utf8')
        .trim()
        .split('\n')
        .map((line) => (JSON.parse(line) as { token: string }).token);

      // assert
      expect(tokens).toEqual(['login-of-the-user', 'login-of-the-user+refreshed']);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        token: 'login-of-the-user+refreshed+refreshed',
      });
      expect(
        filesOfAssistant().filter((name) => name !== '.synapse-session-generation.json'),
      ).toEqual([]);
    });

    it('keeps the working copy of a run when a look at the login ends during that run', async () => {
      // arrange
      const file = login();
      const created = create(fakeCodex({ slow: true }));
      const running = created.assistant('codex').run(turn());

      await vi.waitFor(() => expect(existsSync(record)).toBe(true), { timeout: 5000 });

      // act
      const status = await created.status('codex');

      await running;

      // assert
      expect(status.state).toBe('ready');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        token: 'login-of-the-user+refreshed',
      });
      expect(
        filesOfAssistant().filter((name) => name !== '.synapse-session-generation.json'),
      ).toEqual([]);
    });

    it('commits and removes after a run that failed as well', async () => {
      // arrange
      const file = login();

      // act
      const failed = await create(fakeCodex({ failAfterRefresh: true }))
        .assistant('codex')
        .run(turn())
        .catch((error: unknown) => error);

      // assert
      expect(failed).toBeInstanceOf(Error);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
        token: 'login-of-the-user+refreshed',
      });
      expect(
        filesOfAssistant().filter((name) => name !== '.synapse-session-generation.json'),
      ).toEqual([]);
    });

    it('stops a run on shutdown, and only then removes what it left', async () => {
      // arrange
      login();

      const assistant = create(fakeCodex({ hang: true })).assistant('codex');
      const running = assistant.run(turn()).catch((error: unknown) => error);

      await vi.waitFor(() => expect(existsSync(record)).toBe(true), { timeout: 5000 });

      // act
      await assistants.dispose();
      await running;

      // assert
      expect(
        filesOfAssistant().filter((name) => name !== '.synapse-session-generation.json'),
      ).toEqual([]);
    });

    it('leaves everything alone after a failure that leaves a process unconfirmed, because it may still be writing', async () => {
      // arrange
      login();

      // act
      await create(fakeCodex({ failAfterRefresh: true }), { isCleanupIncomplete: () => true })
        .assistant('codex')
        .run(turn())
        .catch(() => undefined);

      const afterRun = filesOfAssistant();

      await assistants.dispose();

      // assert
      expect(afterRun).toContain('auth.json');
      expect(filesOfAssistant()).toContain('auth.json');
    });

    it('removes what a process that is gone left, and what older versions left, and spares a process that still runs', async () => {
      // arrange
      login();

      const execution = join(root, 'state', 'codex', 'execution');

      for (const [folder, name] of [
        ['codex', 'auth.json'],
        ['sqlite', 'state.sqlite'],
        ['999999-dead', 'auth.json'],
        [`${process.ppid}-aaaa`, 'running.txt'],
      ]) {
        mkdirSync(join(execution, folder), { recursive: true });
        writeFileSync(join(execution, folder, name), 'left');
      }

      // act
      await create(fakeCodex()).assistant('codex').run(turn());

      // assert
      expect(readdirSync(execution)).toEqual([`${process.ppid}-aaaa`]);
    });

    it('keeps two processes of one profile apart, so the end of one run does not remove the login copy of the other', async () => {
      // arrange
      login();

      const first = create(fakeCodex());
      const other = new LocalAssistants({
        synapse: loadSynapse,
        stateRoot: join(root, 'state'),
        environment: {},
        home: join(root, 'home'),
        locate: () => join(root, 'codex'),
      });

      // act
      await first.assistant('codex').run(turn());
      await other.assistant('codex').run(turn());
      await other.dispose();

      const homes = readFileSync(record, 'utf8')
        .trim()
        .split('\n')
        .map((line) => (JSON.parse(line) as { home: string }).home);

      // assert
      expect(new Set(homes).size).toBe(2);
    });
  });

  it('says an assistant is not installed without starting anything', async () => {
    // arrange
    let loaded = false;

    assistants = new LocalAssistants({
      synapse: () => {
        loaded = true;

        return loadSynapse();
      },
      stateRoot: join(root, 'state'),
      environment: {},
      home: join(root, 'home'),
      locate: () => null,
    });

    // act
    const status = await assistants.status('codex');

    // assert
    expect(status.state).toBe('not-installed');
    expect(loaded).toBe(false);
  });

  it('asks for the login and starts none', async () => {
    // arrange
    const executable = fakeClaude({ loggedIn: false });

    // act
    const status = await create(() => executable).status('claude-code');

    // assert
    expect(status.state).toBe('signed-out');
    expect(status.message).toContain('claude auth login');
    expect(JSON.parse(readFileSync(record, 'utf8')).args).toEqual(['auth', 'status', '--json']);
    expect(existsSync(`${record}.login`)).toBe(false);
  });

  it('finds the login of the user: the home is the real one and no other account is named', async () => {
    // arrange
    const executable = fakeClaude({ loggedIn: true });

    // act
    const status = await create(() => executable).status('claude-code');
    const seen = JSON.parse(readFileSync(record, 'utf8'));

    // assert
    expect(status.state).toBe('ready');
    expect(seen.env.HOME).toBe(join(root, 'home'));
    expect(seen.env.CLAUDE_CONFIG_DIR).toBeNull();
    expect(seen.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeNull();
  });

  it('keeps a folder the user chose for its login', async () => {
    // arrange
    const executable = fakeClaude({ loggedIn: true });
    const custom = join(root, 'custom');

    // act
    await create(() => executable, { CLAUDE_CONFIG_DIR: custom }).status('claude-code');

    // assert
    expect(JSON.parse(readFileSync(record, 'utf8')).env.CLAUDE_CONFIG_DIR).toBe(custom);
  });

  it('translates through the real Synapse path: read-only, without tools, in an empty folder of its own', async () => {
    // arrange
    const answer = JSON.stringify([{ key: 'loc.a', value: 'Bonjour {0}', comment: '' }]);
    const executable = fakeClaude({ loggedIn: true, answer });
    const strategy = new LocalAssistantResourceGeneratorStrategy(
      {} as IFileSystem,
      create(() => executable).assistant('claude-code'),
    );

    process.env.WORTLAUT_TEST_SECRET = 'must-not-reach-the-assistant';

    // act
    const report = await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'fr',
      models: [{ key: 'loc.a', value: 'Hello {0}', comment: 'A greeting' }],
      instructions: 'Use tu.',
      retryBudget: 0,
    });
    const seen = JSON.parse(readFileSync(record, 'utf8'));

    delete process.env.WORTLAUT_TEST_SECRET;

    // assert
    expect(report.error?.message ?? null).toBeNull();
    expect(report.status).toBe('done');
    expect(report.rows[0].value).toBe('Bonjour {0}');
    expect(report.tokens).toBe(10);
    expect(seen.args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--tools', '']));
    expect(seen.input).toContain('Use tu.');
    expect(seen.input).toContain('A greeting');
    expect(seen.cwd.endsWith(join('state', 'workspace'))).toBe(true);
    expect(seen.env.SECRET).toBeNull();
  });

  it('gives OpenCode no tool that reaches beyond its empty folder, not the web and not a server of the user', async () => {
    // arrange
    const executable = join(root, 'opencode');

    writeFileSync(
      executable,
      `#!/usr/bin/env node\nif (process.env.OPENCODE_PERMISSION) require('fs').writeFileSync(${JSON.stringify(record)}, process.env.OPENCODE_PERMISSION);\nprocess.exit(1);\n`,
    );
    chmodSync(executable, 0o755);
    const strategy = new LocalAssistantResourceGeneratorStrategy(
      {} as IFileSystem,
      create(() => executable).assistant('opencode'),
    );

    // act
    await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'fr',
      models: [{ key: 'a', value: 'A', comment: '' }],
      retryBudget: 0,
    });

    // assert
    expect(JSON.parse(readFileSync(record, 'utf8'))).toEqual({
      '*': 'deny',
      read: 'allow',
      external_directory: 'deny',
      task: 'deny',
      bash: 'deny',
      edit: 'deny',
    });
  });

  it('hands over a failure of the tool as a failed chunk', async () => {
    // arrange
    const executable = join(root, 'claude');

    writeFileSync(executable, '#!/bin/sh\nexit 1\n');
    chmodSync(executable, 0o755);

    const strategy = new LocalAssistantResourceGeneratorStrategy(
      {} as IFileSystem,
      create(() => executable).assistant('claude-code'),
    );

    // act
    const report = await translateChunk(strategy, {
      resource: { type: 'json', locale: 'en' },
      locale: 'fr',
      models: [{ key: 'a', value: 'A', comment: '' }],
      retryBudget: 0,
    });

    // assert
    expect(report.status).toBe('failed');
    expect(report.rows).toEqual([]);
  });

  it('gives every surface the true state of all providers', async () => {
    // arrange
    const executable = fakeClaude({ loggedIn: false });
    const local = create((command) => (command === 'claude' ? executable : null));
    const host = new AiProviderHost({
      fileSystem: {} as IFileSystem,
      local,
      keys: {
        get: () => Promise.resolve(null),
        has: (provider) => Promise.resolve(provider === 'google'),
      },
    });

    // act
    const providers = await host.list();

    // assert
    expect(providers.map(({ id, state }) => [id, state])).toEqual([
      ['claude-code', 'signed-out'],
      ['codex', 'not-installed'],
      ['opencode', 'not-installed'],
      ['openai', 'no-key'],
      ['google', 'ready'],
    ]);
  });
});
