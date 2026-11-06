// #region Imports

import { Boolean, type IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_INIT_COMMAND_ARGS_CONFIG } from './configurations/IInitCommandArgsConfig.js';

// #endregion

/**
 * Argument to replace an existing configuration file.
 *
 * @internal
 */
export const FORCE_ARG: IProgramArg = {
  alias: '--force',
  options: {
    type: (value: string) => Boolean.parse(value),
    required: false,
    default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.force,
    metavar: 'boolean',
    help: 'Replaces a configuration file that exists.',
  },
};

/**
 * Aggregate export for all init command arguments.
 *
 * @internal
 */
export const INIT_COMMAND_ARGS: Array<IProgramArg> = [
  ...CLI_ARGS,
  REVIEW_ARG,
  FORCE_ARG,
  {
    alias: ['-r', '--root'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.root,
      metavar: 'string',
      help: 'The root directory of the sources, relative to the working directory.',
    },
  },
  {
    alias: ['-rr', '--resource-root'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.resourceRoot,
      metavar: 'string',
      help: 'The directory of the catalogs, relative to the working directory.',
    },
  },
  {
    alias: ['-p', '--preset'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.preset,
      metavar: 'string',
      help: 'The framework preset.',
      choices: ['', 'angular', 'react', 'vue', 'lit', 'stencil'],
    },
  },
  {
    alias: ['-t', '--type'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.type,
      metavar: 'string',
      help: 'The format of the catalogs.',
      choices: ['json', 'resx', 'po'],
    },
  },
  {
    alias: ['-bl', '--base-locale'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.baseLocale,
      metavar: 'string',
      help: 'The locale the others are translated from.',
    },
  },
  {
    alias: ['-l', '--locales'],
    options: {
      type: (value: string) =>
        value
          .split(',')
          .map((locale) => locale.trim())
          .filter((locale) => locale.length > 0),
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.locales,
      metavar: 'Array',
      help: 'A comma-separated list of target locales.',
    },
  },
  {
    alias: ['-P', '--resource-key-prefix'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.resourceKeyPrefix,
      metavar: 'string',
      help: 'The prefix of the resource keys.',
    },
  },
  {
    alias: ['-S', '--resource-key-suffix'],
    options: {
      required: false,
      default: DEFAULT_INIT_COMMAND_ARGS_CONFIG.resourceKeySuffix,
      metavar: 'string',
      help: 'The suffix of the resource keys.',
    },
  },
];
