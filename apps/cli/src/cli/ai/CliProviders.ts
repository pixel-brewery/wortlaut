// #region Imports

import { homedir } from 'node:os';
import { join } from 'node:path';
import { FileSystem } from '@pixel-brewery/utilities';
import {
  AiProviderHost,
  createEnvironmentKeySource,
  LocalAssistantResourceGeneratorStrategy,
  LocalAssistants,
  type IResourceGeneratorStrategy,
  type ISynapseModules,
  type LocalAssistantId,
} from '@pixel-brewery/wortlaut-ai';
import { resolveProfileRoot } from '@pixel-brewery/wortlaut-engine';

// #endregion

/**
 * Loads a package that only speaks ES modules. The command line is compiled to CommonJS, where a plain `import()` would turn
 * into a `require`.
 */
const importModule = new Function('specifier', 'return import(specifier)') as <TModule>(
  specifier: string,
) => Promise<TModule>;

/**
 * Loads Synapse when an assistant is first asked for something, so a command that needs none starts as fast as ever.
 *
 * @private
 */
async function loadSynapse(): Promise<ISynapseModules> {
  const [core, runtime, claude, codex, opencode] = await Promise.all([
    importModule<typeof import('@pixel-brewery/synapse-core')>('@pixel-brewery/synapse-core'),
    importModule<typeof import('@pixel-brewery/synapse-runtime')>('@pixel-brewery/synapse-runtime'),
    importModule<typeof import('@pixel-brewery/synapse-provider-claude')>(
      '@pixel-brewery/synapse-provider-claude',
    ),
    importModule<typeof import('@pixel-brewery/synapse-provider-codex')>(
      '@pixel-brewery/synapse-provider-codex',
    ),
    importModule<typeof import('@pixel-brewery/synapse-provider-opencode')>(
      '@pixel-brewery/synapse-provider-opencode',
    ),
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

/**
 * Composes the local assistants of the command line.
 *
 * @internal
 * @param environment The environment.
 * @returns The assistants.
 */
export function createCliAssistants(environment: NodeJS.ProcessEnv = process.env): LocalAssistants {
  const home = homedir();

  return new LocalAssistants({
    synapse: loadSynapse,
    stateRoot: join(resolveProfileRoot(environment, process.platform, home), 'assistants'),
    environment,
    home,
  });
}

/**
 * Composes the providers of the command line: the assistants of this computer with their own login, and keys from the
 * environment. It never reads the keychain of the app.
 *
 * @internal
 * @param environment The environment.
 * @returns The providers.
 */
export function createCliProviders(environment: NodeJS.ProcessEnv = process.env): AiProviderHost {
  return new AiProviderHost({
    fileSystem: new FileSystem(),
    local: createCliAssistants(environment),
    keys: createEnvironmentKeySource(environment),
  });
}

/**
 * Makes the strategies of the local assistants. They load nothing until a run asks for one, and an API key provider needs
 * none here, because the generator builds it.
 *
 * @internal
 * @param assistants The assistants.
 * @returns The strategies by name.
 */
export function createLocalStrategies(
  assistants: LocalAssistants,
): ReadonlyMap<string, IResourceGeneratorStrategy> {
  return new Map(
    (['claude-code', 'codex', 'opencode'] as const).map((name: LocalAssistantId) => [
      name,
      new LocalAssistantResourceGeneratorStrategy(new FileSystem(), assistants.assistant(name)),
    ]),
  );
}
