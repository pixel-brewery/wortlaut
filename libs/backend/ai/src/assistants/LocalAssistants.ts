// #region Imports

import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiDriverBase, IAiInstance, IAiPolicy, IAiResult } from '@pixel-brewery/synapse-core';
import type {
  AiRuntime,
  IAiRuntimeOptions,
  IProcessRequest,
  IProcessResult,
  NodeProcessRunner,
} from '@pixel-brewery/synapse-runtime';
import type {
  ILocalAssistant,
  ILocalAssistantAnswer,
  ILocalAssistantTurn,
} from '../generator/strategies/LocalAssistantResourceGeneratorStrategy.js';
import { locateAssistant } from './AssistantLocator.js';

// #endregion

/**
 * The most runs that go on at the same time.
 */
const MAX_RUNS = 8;

/**
 * The biggest prompt of a chunk.
 */
const MAX_PROMPT_BYTES = 1024 * 1024;

/**
 * How long one chunk may take.
 */
const RUN_TIMEOUT_MS = 300_000;

/**
 * How long asking for the login may take.
 */
const STATUS_TIMEOUT_MS = 15_000;

/**
 * The folders of a process below `execution` and `temporary`, with the id of the process.
 */
const SESSION_FOLDER = /^(\d+)-[0-9a-f]+$/;

/**
 * The local assistants Wortlaut knows.
 *
 * @public
 */
export type LocalAssistantId = 'claude-code' | 'codex' | 'opencode';

/**
 * The true state of a local assistant.
 *
 * @public
 */
export type LocalAssistantState = 'ready' | 'not-installed' | 'signed-out' | 'unknown';

/**
 * What asking for the state of a local assistant found.
 *
 * @public
 */
export interface ILocalAssistantStatus {
  state: LocalAssistantState;

  /**
   * Why the state could not be found out.
   */
  message: string | null;
}

/**
 * The parts of Synapse a surface hands over, because only a surface decides to compose them and knows how to load them.
 *
 * @public
 */
export interface ISynapseModules {
  AiRuntime: new (options: IAiRuntimeOptions) => AiRuntime;
  NodeProcessRunner: new () => NodeProcessRunner;
  ClaudeDriver: new (runner: NodeProcessRunner) => AiDriverBase;
  CodexDriver: new (runner: NodeProcessRunner) => AiDriverBase;
  OpenCodeDriver: new (runner: NodeProcessRunner) => AiDriverBase;

  /**
   * Recognizes a failure after which Synapse cannot confirm that the native process has stopped.
   */
  isCleanupIncomplete: (value: unknown) => boolean;
}

/**
 * What local assistants are composed of.
 *
 * @public
 */
export interface ILocalAssistantsInit {
  /**
   * Loads Synapse, the first time an assistant is asked for something.
   */
  synapse: () => Promise<ISynapseModules>;

  /**
   * A folder of Wortlaut, for what an assistant does while it runs: never the home of the assistant.
   */
  stateRoot: string;

  /**
   * The environment, as the surface found it.
   */
  environment: Readonly<Record<string, string | undefined>>;

  /**
   * The home of the user, where the assistants keep their own login.
   */
  home: string;

  /**
   * Finds an executable, instead of the search on this computer.
   */
  locate?: (command: string) => string | null;
}

/**
 * Who each assistant is, for Synapse and on this computer.
 */
const ASSISTANTS: Readonly<
  Record<
    LocalAssistantId,
    {
      driver: string;
      command: string;
      configuration: (home: string, environment: ILocalAssistantsInit['environment']) => string;
      credentials: (home: string, environment: ILocalAssistantsInit['environment']) => string;
      policy: IAiPolicy;
      signedOut: string;
    }
  >
> = {
  'claude-code': {
    driver: 'claude',
    command: 'claude',
    configuration: (home, environment) => environment['CLAUDE_CONFIG_DIR'] || join(home, '.claude'),
    credentials: (home, environment) => environment['CLAUDE_CONFIG_DIR'] || join(home, '.claude'),
    // A translation needs no tool at all.
    policy: { mode: 'read-only', allowedTools: [] },
    signedOut: 'Claude Code is not signed in. Run `claude auth login` in a terminal.',
  },
  codex: {
    driver: 'codex',
    command: 'codex',
    configuration: (home, environment) => environment['CODEX_HOME'] || join(home, '.codex'),
    credentials: (home, environment) => environment['CODEX_HOME'] || join(home, '.codex'),
    policy: { mode: 'read-only' },
    signedOut: 'Codex is not signed in. Run `codex login` in a terminal.',
  },
  opencode: {
    driver: 'opencode',
    command: 'opencode',
    configuration: (home) => join(home, '.config', 'opencode'),
    credentials: (home) => join(home, '.local', 'share', 'opencode'),
    // An empty list would allow every tool here, with the web and the servers of the user, so one harmless tool keeps them out.
    policy: { mode: 'read-only', allowedTools: ['read'] },
    signedOut: 'OpenCode is not signed in. Run `opencode auth login` in a terminal.',
  },
};

/**
 * Synapse as it was composed.
 */
interface ISynapseHost {
  runtime: AiRuntime;
  runner: NodeProcessRunner;
  drivers: ReadonlyMap<string, AiDriverBase>;
  isCleanupIncomplete: ISynapseModules['isCleanupIncomplete'];
}

/**
 * The local assistants through Synapse. They use the login the user made with the tool itself, so Wortlaut starts no login,
 * installs nothing and reads no credentials: it runs the tool, and the tool finds its own account.
 *
 * @remarks
 * Construction is inert. Synapse isolates a profile by default, which would hide the login of the user, so a profile here
 * names the folders of the tool itself and only the temporary and execution folders of Wortlaut. A chunk runs in an empty folder of
 * Wortlaut in read-only mode, so an assistant sees nothing of a repository but the text of the prompt.
 *
 * Those two folders hold a working copy of a login and the sessions of a tool while it runs, because Codex keeps both in the home
 * Synapse gives it. They belong to this process alone, so another process of the same profile is never pulled out from under
 * a run, and they are removed as soon as no call of the assistant is left: Synapse has committed a refreshed token by the time a
 * call ends. After a failure that leaves a native process unconfirmed, nothing commits and nothing is removed until the next start.
 *
 * @public
 */
export class LocalAssistants {
  // #region Fields

  private readonly _init: ILocalAssistantsInit;
  private readonly _instances: Map<LocalAssistantId, IAiInstance>;
  private readonly _session: string;
  private readonly _calls: Map<LocalAssistantId, number>;
  private readonly _clearing: Map<LocalAssistantId, Promise<void>>;
  private readonly _unconfirmed: Set<LocalAssistantId>;
  private _synapse: Promise<ISynapseHost> | null;
  private _disposed: boolean;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `LocalAssistants` class.
   *
   * @public
   * @param init What they are composed of.
   */
  public constructor(init: ILocalAssistantsInit) {
    this._init = init;
    this._instances = new Map();
    this._session = `${process.pid}-${randomBytes(4).toString('hex')}`;
    this._calls = new Map();
    this._clearing = new Map();
    this._unconfirmed = new Set();
    this._synapse = null;
    this._disposed = false;
  }

  // #endregion

  // #region Methods

  /**
   * Returns whether an assistant is installed. It looks at files only.
   *
   * @public
   * @param id The assistant.
   * @returns The path of its executable, or `null`.
   */
  public locate(id: LocalAssistantId): string | null {
    const { command } = ASSISTANTS[id];

    return this._init.locate
      ? this._init.locate(command)
      : locateAssistant(command, this._init.environment, this._init.home);
  }

  /**
   * Asks an assistant for its login. It starts no login and runs no model.
   *
   * @public
   * @param id The assistant.
   * @returns The true state.
   */
  public async status(id: LocalAssistantId): Promise<ILocalAssistantStatus> {
    if (!this.locate(id)) {
      return { state: 'not-installed', message: null };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

    try {
      const { runtime, drivers } = await this.synapse();
      const instance = await this.prepare(id);

      await this.enter(id);

      const release = runtime.access.enter(instance.profile.id, () => controller.abort());

      try {
        const status = await drivers
          .get(instance.driverId)
          ?.auth?.status(instance, controller.signal);

        return status?.authenticated
          ? { state: 'ready', message: null }
          : { state: 'signed-out', message: ASSISTANTS[id].signedOut };
      } finally {
        release();
        await this.leave(id);
      }
    } catch (error) {
      return { state: 'unknown', message: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Returns one assistant as a strategy sees it.
   *
   * @public
   * @param id The assistant.
   * @returns The assistant.
   */
  public assistant(id: LocalAssistantId): ILocalAssistant {
    return { run: (turn) => this.run(id, turn) };
  }

  /**
   * Stops what is going on and waits until it has stopped, and then removes what the assistants left in the profile. Synapse
   * has committed a refreshed token by then. It leaves the folders alone when it cannot confirm that a process has stopped.
   *
   * @public
   * @returns When no process of an assistant is left.
   */
  public async dispose(): Promise<void> {
    this._disposed = true;

    const synapse = await this._synapse?.catch(() => null);

    if (!synapse) {
      return;
    }

    const stopped = await Promise.allSettled([synapse.runtime.dispose(), synapse.runner.dispose()]);
    const isConfirmed = !stopped.some(
      (result) => result.status === 'rejected' && synapse.isCleanupIncomplete(result.reason),
    );

    await Promise.allSettled(this._clearing.values());

    if (isConfirmed) {
      await Promise.allSettled(
        Array.from(this._instances.keys())
          .filter((id) => !this._unconfirmed.has(id))
          .map((id) => this.clear(id)),
      );
    }
  }

  /**
   * @private
   */
  private async run(
    id: LocalAssistantId,
    turn: ILocalAssistantTurn,
  ): Promise<ILocalAssistantAnswer> {
    const { runtime, drivers, isCleanupIncomplete } = await this.synapse();
    const instance = await this.prepare(id);
    const supportsSchema = drivers.get(instance.driverId)?.capabilities.structuredOutput !== 'none';
    const workspace = join(this._init.stateRoot, 'workspace');

    await this.enter(id);

    try {
      mkdirSync(workspace, { recursive: true, mode: 0o700 });

      const handle = runtime.run({
        target: { instanceId: instance.id, candidateId: `${instance.id}:default` },
        prompt: turn.prompt,
        policy: ASSISTANTS[id].policy,
        workingDirectory: workspace,
        ...(supportsSchema && turn.outputSchema ? { outputSchema: turn.outputSchema } : {}),
        ...(turn.signal ? { signal: turn.signal } : {}),
      });

      // The result settles only when the driver is done, and the driver commits a refreshed token before that.
      const result: IAiResult = await handle.result;

      return {
        text: result.text,
        structured: result.structured,
        tokens: result.usage?.total ?? null,
      };
    } catch (error) {
      if (isCleanupIncomplete(error)) {
        this._unconfirmed.add(id);
      }

      throw error;
    } finally {
      await this.leave(id);
    }
  }

  /**
   * Counts a call of an assistant, and waits until what the last one left is gone. The folders of Synapse exist for its child
   * processes, whose temporary folder must be there.
   *
   * @private
   */
  private async enter(id: LocalAssistantId): Promise<void> {
    this._calls.set(id, (this._calls.get(id) ?? 0) + 1);

    await this._clearing.get(id);

    for (const folder of this.foldersOf(id)) {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Ends a call. The last one removes the login copy and the sessions, unless a process could not be confirmed to have stopped:
   * it may still be writing there, and Synapse has not committed its token.
   *
   * @private
   */
  private async leave(id: LocalAssistantId): Promise<void> {
    const left = (this._calls.get(id) ?? 1) - 1;

    this._calls.set(id, left);

    if (left === 0 && !this._unconfirmed.has(id) && !this._disposed) {
      await this.clear(id);
    }
  }

  /**
   * Removes the folders of this process. A failure stays quiet, because the next call or the next start tries again.
   *
   * @private
   */
  private clear(id: LocalAssistantId): Promise<void> {
    const clearing = Promise.allSettled(
      this.foldersOf(id).map((folder) =>
        rm(folder, { recursive: true, force: true, maxRetries: 2 }),
      ),
    ).then(() => {
      if (this._clearing.get(id) === clearing) {
        this._clearing.delete(id);
      }
    });

    this._clearing.set(id, clearing);

    return clearing;
  }

  /**
   * @private
   */
  private foldersOf(id: LocalAssistantId): Array<string> {
    const own = join(this._init.stateRoot, id);

    return [join(own, 'execution', this._session), join(own, 'temporary', this._session)];
  }

  /**
   * Removes what a process left that is gone, such as one that crashed during a run, and what older versions left directly in
   * these folders. A process that still runs keeps its folders.
   *
   * @private
   */
  private removeLeftovers(id: LocalAssistantId): void {
    const own = join(this._init.stateRoot, id);

    for (const parent of [join(own, 'execution'), join(own, 'temporary')]) {
      let names: Array<string> = [];

      try {
        names = readdirSync(parent);
      } catch {
        // There is nothing yet.
      }

      for (const name of names.filter((candidate) => !isRunningProcessFolder(candidate))) {
        rmSync(join(parent, name), { recursive: true, force: true });
      }
    }
  }

  /**
   * @private
   */
  private async prepare(id: LocalAssistantId): Promise<IAiInstance> {
    const existing = this._instances.get(id);
    const { runtime } = await this.synapse();

    if (existing) {
      return existing;
    }

    const executable = this.locate(id);

    if (!executable) {
      throw new Error(`${id} is not installed on this computer.`);
    }

    const { driver, configuration, credentials } = ASSISTANTS[id];
    const { home, environment, stateRoot } = this._init;
    const own = join(stateRoot, id);
    const [execution, temporary] = this.foldersOf(id);

    this.removeLeftovers(id);

    const instance: IAiInstance = {
      id: `wortlaut:${id}`,
      driverId: driver,
      executable,
      profile: {
        id: `wortlaut:${id}:own-login`,
        applicationId: 'wortlaut',
        accountId: 'own-login',
        paths: {
          root: own,
          home,
          configuration: configuration(home, environment),
          credentials: credentials(home, environment),
          execution,
          temporary,
        },
      },
    };

    await runtime.configureInstance(instance);
    this._instances.set(id, instance);

    return instance;
  }

  /**
   * @private
   */
  private synapse(): Promise<ISynapseHost> {
    if (this._disposed) {
      return Promise.reject(new Error('The local assistants have been stopped.'));
    }

    this._synapse ??= this.compose();

    return this._synapse;
  }

  /**
   * @private
   */
  private async compose(): Promise<ISynapseHost> {
    const modules = await this._init.synapse();
    const runner = createOwnLoginRunner(modules.NodeProcessRunner, this._init.environment);
    const drivers = [
      new modules.ClaudeDriver(runner),
      new modules.CodexDriver(runner),
      new modules.OpenCodeDriver(runner),
    ];
    const runtime = new modules.AiRuntime({
      drivers,
      instances: [],
      maximumRuns: MAX_RUNS,
      eventCapacity: 128,
      maximumPromptBytes: MAX_PROMPT_BYTES,
      defaultTimeoutMs: RUN_TIMEOUT_MS,
    });

    return {
      runtime,
      runner,
      drivers: new Map(drivers.map((driver) => [driver.id, driver])),
      isCleanupIncomplete: modules.isCleanupIncomplete,
    };
  }

  // #endregion
}

/**
 * Returns whether a folder belongs to a process that still runs, so it is not this process's to remove.
 *
 * @private
 */
function isRunningProcessFolder(name: string): boolean {
  const match = SESSION_FOLDER.exec(name);

  if (!match) {
    return false;
  }

  try {
    process.kill(Number(match[1]), 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Creates the process runner of the assistants. Synapse always names a configuration folder of Claude Code, and the tool then
 * looks for another account in the keychain than the one the user signed in to. So these two variables stay as the user set
 * them, and otherwise the tool finds its own login as it does in a terminal.
 *
 * @internal
 * @param base The runner of Synapse.
 * @param environment The environment of the surface.
 * @returns The runner.
 */
export function createOwnLoginRunner(
  base: ISynapseModules['NodeProcessRunner'],
  environment: ILocalAssistantsInit['environment'],
): NodeProcessRunner {
  return new (class extends base {
    /**
     * @override
     */
    public override run(request: IProcessRequest): Promise<IProcessResult> {
      const next = { ...request.environment };

      for (const name of ['CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) {
        const own = environment[name];

        if (own) {
          next[name] = own;
        } else {
          delete next[name];
        }
      }

      return super.run({ ...request, environment: next });
    }
  })();
}

/**
 * Says how to install a local assistant. Wortlaut installs nothing: this is text for the user.
 *
 * @public
 * @param id The assistant.
 * @returns The text.
 */
export function installHintOf(id: LocalAssistantId): string {
  switch (id) {
    case 'claude-code':
      return 'Install Claude Code from https://claude.com/claude-code, or run `brew install --cask claude-code`. Then run `claude auth login` once in a terminal. Wortlaut installs nothing and starts no login.';
    case 'codex':
      return 'Install Codex with `npm install -g @openai/codex`. Then run `codex login` once in a terminal. Wortlaut installs nothing and starts no login.';
    default:
      return 'Install OpenCode from https://opencode.ai, or run `brew install opencode`. Then run `opencode auth login` once in a terminal. Wortlaut installs nothing and starts no login.';
  }
}
