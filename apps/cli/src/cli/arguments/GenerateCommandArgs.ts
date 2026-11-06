/* eslint-disable @stylistic/indent-binary-ops */

// #region Imports

import {
  Boolean,
  bold,
  cyan,
  dim,
  Languages,
  underline,
  type IProgramArg,
} from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_GENERATE_COMMAND_ARGS_CONFIG } from './configurations/IGenerateCommandArgsConfig.js';

// #endregion

// #region Arguments

/**
 * Argument to specify the strategy for generating resources.
 *
 * @internal
 */
export const STRATEGY_ARG: IProgramArg = {
  alias: ['-s', '--strategy'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => value,
    required: true,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.strategy,
    metavar: 'string',
    help:
      `${underline(cyan('Strategy'))}: Specifies the strategy used to generate resources.\n` +
      `Choose between ${bold('openai')} (or ${bold('chatgpt')}) and ${bold('google')} (or ${bold('gemini')}) with an API key, or ${bold('claude-code')}, ${bold('codex')} and ${bold('opencode')} with their own login.\n${dim('Default: openai')}`,
    choices: ['openai', 'chatgpt', 'google', 'gemini', 'claude-code', 'codex', 'opencode'],
  },
};

/**
 * Argument to specify the locales for resource generation.
 *
 * @internal
 */
export const LOCALES_ARG: IProgramArg = {
  alias: ['-l', '--locales'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => {
      const locales = value.split(',').map((locale) => locale.trim());

      locales.forEach((locale) => {
        if (!Languages.has(locale)) {
          throw new Error(`Invalid locale: ${locale}`);
        }
      });

      return locales;
    },
    required: true,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.locales,
    metavar: 'Array',
    help:
      `${underline(cyan('Locales'))}: A comma-separated list of target locales for resource generation.\n` +
      `Each locale must follow standard locale conventions like ${bold('en-US')} or ${bold('de-DE')}.\n${dim('Default: []')}`,
  },
};

/**
 * Argument to specify the base locale.
 *
 * @internal
 */
export const BASE_LOCALE_ARG: IProgramArg = {
  alias: ['-bl', '--base-locale'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => {
      if (!Languages.has(value)) {
        throw new Error(`Invalid base locale: ${value}`);
      }

      return value;
    },
    required: true,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.baseLocale,
    metavar: 'string',
    help:
      `${underline(cyan('Base Locale'))}: Specifies the source locale for translations.\n` +
      `This locale will be used as the reference when generating translations.\n${dim('Default: en')}`,
  },
};

/**
 * Argument to provide the API key for AI access.
 *
 * @internal
 */
export const API_KEY_ARG: IProgramArg = {
  alias: ['-ak', '--api-key'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => value,
    required: true,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.apiKey,
    metavar: 'string',
    help:
      `${underline(cyan('API Key'))}: Your API key for accessing the AI service.\n` +
      `Ensure you provide a valid API key for your chosen strategy.\n${dim('This field is required.')}`,
  },
};

/**
 * Argument to specify the AI model to use.
 *
 * @internal
 */
export const MODEL_ARG: IProgramArg = {
  alias: ['-m', '--model'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => value,
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.model,
    metavar: 'string',
    help:
      `${underline(cyan('Model'))}: The specific AI model to use for translations.\n` +
      `For example, use ${bold('gpt-4')} for ChatGPT or ${bold('text-bison')} for Gemini.\n${dim('Default: gemini-2.0-flash')}`,
  },
};

/**
 * Argument to specify the temperature for AI responses.
 *
 * @internal
 */
export const TEMPERATURE_ARG: IProgramArg = {
  alias: ['-temp', '--temperature'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => parseFloat(value),
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.temperature,
    metavar: 'number',
    help:
      `${underline(cyan('Temperature'))}: Controls the creativity of AI responses.\n` +
      `Higher values (e.g., 1.0) make responses more creative, while lower values (e.g., 0.2) make them more focused.\n${dim('Default: 0.7')}`,
  },
};

/**
 * Argument to specify the resource type.
 *
 * @internal
 */
export const TYPE_ARG: IProgramArg = {
  alias: ['-t', '--type'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => value,
    required: true,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.type,
    metavar: 'string',
    help:
      `${underline(cyan('Type'))}: The type of resource to process.\n` +
      `Valid options are ${bold('json')} for JSON files, ${bold('resx')} for RESX files or ${bold('po')} for PO files.\n${dim('Default: json')}`,
    choices: ['json', 'resx', 'po'],
  },
};

/**
 * Argument to specify the root directory of resources.
 *
 * @internal
 */
export const RESOURCE_ROOT_ARG: IProgramArg = {
  alias: ['-rr', '--resource-root'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => value,
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.resourceRoot,
    metavar: 'string',
    help:
      `${underline(cyan('Resource Root'))}: Specifies the directory containing the resource files.\n` +
      `Provide the path to the folder where translation files like JSON or RESX are located.\n${dim("Default: ''")}`,
  },
};

/**
 * Argument to specify the chunk size for processing resources.
 *
 * @internal
 */
export const CHUNK_SIZE_ARG: IProgramArg = {
  alias: ['-cs', '--chunk-size'], // Long alias changed to kebab-case
  options: {
    type: (value: string) => parseInt(value, 10),
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.chunkSize,
    metavar: 'number',
    help:
      `${underline(cyan('Chunk Size'))}: The number of resources to process in a single batch.\n` +
      `Use this option to control the number of resources processed at once.\n${dim('Default: 10')}`,
  },
};

/**
 * Argument to limit the number of keys that are translated.
 *
 * @internal
 */
export const LIMIT_ARG: IProgramArg = {
  alias: ['-lm', '--limit'],
  options: {
    type: (value: string) => {
      const limit = parseInt(value, 10);

      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid limit: ${value}`);
      }

      return limit;
    },
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.limit,
    metavar: 'number',
    help: `${underline(cyan('Limit'))}: The most keys to translate. Empty means no limit.`,
  },
};

/**
 * Argument to select the keys that are translated.
 *
 * @internal
 */
export const SCOPE_ARG: IProgramArg = {
  alias: ['-sc', '--scope'],
  options: {
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.scope,
    metavar: 'string',
    help: `${underline(cyan('Scope'))}: Which keys to translate: ${bold('all')}, ${bold('new')} (the target lacks them) or ${bold('missing')} (the target lacks them or holds them identical to the base locale).`,
    choices: ['all', 'new', 'missing'],
  },
};

/**
 * Argument to translate only the keys below a namespace.
 *
 * @internal
 */
export const NAMESPACE_ARG: IProgramArg = {
  alias: ['-ns', '--namespace'],
  options: {
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.namespace,
    metavar: 'string',
    help: `${underline(cyan('Namespace'))}: Translates only the keys below this namespace, e.g. ${bold('loc.orders')}. The target keeps its other keys.`,
  },
};

/**
 * Argument to translate only these keys.
 *
 * @internal
 */
export const KEYS_ARG: IProgramArg = {
  alias: ['-ks', '--keys'],
  options: {
    type: (value: string) =>
      value
        .split(',')
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.keys,
    metavar: 'Array',
    help: `${underline(cyan('Keys'))}: A comma-separated list of the only keys to translate. The target keeps its other keys.`,
  },
};

/**
 * Argument to specify extended instructions for the generator.
 *
 * @internal
 */
export const EXTENDED_INSTRUCTION_ARG: IProgramArg = {
  alias: ['-i', '--instructions'],
  options: {
    type: (value: string) => value,
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.instructions,
    metavar: 'string',
    help:
      `${underline(cyan('Instructions'))}: Additional instructions for the generator.\n` +
      `Use this option to provide specific instructions or context for the AI model.\n${dim("Default: ''")}`,
  },
};

// #endregion

// #region Exports

/**
 * Argument to translate only the keys the target locale does not have yet.
 *
 * @internal
 */
export const ONLY_NEW_ARG: IProgramArg = {
  alias: ['-on', '--only-new'],
  options: {
    type: (value: string) => Boolean.parse(value),
    required: false,
    default: DEFAULT_GENERATE_COMMAND_ARGS_CONFIG.onlyNew,
    metavar: 'boolean',
    help: `${underline(cyan('Only New'))}: Translates only the keys the target locale does not have yet.`,
  },
};

/**
 * Aggregate export for all AI command arguments.
 *
 * @internal
 */
export const GENERATE_COMMAND_ARGS = [
  ...CLI_ARGS,
  STRATEGY_ARG,
  LOCALES_ARG,
  BASE_LOCALE_ARG,
  API_KEY_ARG,
  MODEL_ARG,
  TEMPERATURE_ARG,
  TYPE_ARG,
  RESOURCE_ROOT_ARG,
  CHUNK_SIZE_ARG,
  LIMIT_ARG,
  EXTENDED_INSTRUCTION_ARG,
  ONLY_NEW_ARG,
  SCOPE_ARG,
  NAMESPACE_ARG,
  KEYS_ARG,
  REVIEW_ARG,
];

// #endregion
