// #region Imports

import type { IApiKeySource } from './AiProviderHost.js';
import type { KeyProviderId } from './KeyProviders.js';

// #endregion

/**
 * The environment variables that hold the key of a provider, by the names of its strategy.
 */
const API_KEY_VARIABLES: Readonly<Record<string, ReadonlyArray<string>>> = {
  openai: ['OPENAI_API_KEY'],
  chatgpt: ['OPENAI_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
  gemini: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
};

/**
 * Reads the key of a provider from the environment.
 *
 * @public
 * @param strategy The name of the strategy.
 * @param environment The environment.
 * @returns The key, or an empty text.
 */
export function readEnvironmentKey(
  strategy: string,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  for (const variable of API_KEY_VARIABLES[strategy] ?? []) {
    const value = environment[variable];

    if (value) {
      return value;
    }
  }

  return '';
}

/**
 * The keys of the command line: from the environment or the flag, never from the keychain of the app.
 *
 * @public
 * @param environment The environment.
 * @returns The source.
 */
export function createEnvironmentKeySource(
  environment: Readonly<Record<string, string | undefined>>,
): IApiKeySource {
  return {
    get: (provider: KeyProviderId) =>
      Promise.resolve(readEnvironmentKey(provider, environment) || null),
    has: (provider: KeyProviderId) =>
      Promise.resolve(readEnvironmentKey(provider, environment) !== ''),
  };
}
