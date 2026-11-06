// #region Imports

import { config as loadDotEnvFile } from 'dotenv';
import { expand, type DotenvExpandOutput } from 'dotenv-expand';

// #endregion

/**
 * The options that read values from the environment.
 *
 * @public
 */
export interface IEnvOptions {
  env?: Record<string, string>;
  envFile?: string;
}

/**
 * Loads a .env file into the given variables and expands the references in it.
 *
 * @internal
 * @param filename The .env file.
 * @param environmentVariables The variables to load it into.
 * @returns The expanded file, with `error` when it could not be read.
 */
export function loadAndExpandDotEnvFile(
  filename: string,
  environmentVariables: NodeJS.ProcessEnv,
): DotenvExpandOutput {
  const env = loadDotEnvFile({
    path: filename,
    processEnv: environmentVariables as Record<string, string>,
    override: false,
    quiet: true,
  });

  return expand({ ...env, processEnv: environmentVariables as Record<string, string> });
}

/**
 * Replaces each option that is exactly `{env.NAME}` with that variable of the file.
 *
 * @internal
 * @param input The options.
 * @param environmentVariables The expanded file.
 * @returns The options with their values.
 * @throws When the file does not set a variable that an option names.
 */
export function resolveOptionTree<T>(input: T, environmentVariables: DotenvExpandOutput): T {
  if (typeof input === 'string') {
    return resolveOption(input, environmentVariables) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item: unknown) => resolveOptionTree(item, environmentVariables)) as T;
  }

  if (typeof input === 'object' && input !== null) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        resolveOptionTree(value, environmentVariables),
      ]),
    ) as T;
  }

  return input;
}

function resolveOption(raw: string, environmentVariables: DotenvExpandOutput): string {
  const name = /^\{env\.([A-Z0-9_]+)\}$/.exec(raw)?.[1];

  if (!name) {
    return raw;
  }

  const value = environmentVariables.parsed?.[name];

  if (!value) {
    throw new Error(`The environment variable ${name} is not set.`);
  }

  return value;
}
