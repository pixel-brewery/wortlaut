// #region Imports

import { Boolean, type IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_DETECT_COMMAND_ARGS_CONFIG } from './configurations/IDetectCommandArgsConfig.js';

// #endregion

// #region Exports

/**
 * Leaves test and specification files out.
 *
 * @internal
 */
export const SKIP_TESTS_ARG: IProgramArg = {
  alias: '--skip-tests',
  options: {
    type: (value: string) => Boolean.parse(value),
    required: false,
    default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.skipTests,
    metavar: 'boolean',
    help: 'Leaves test and specification files out.',
  },
};

/**
 * Replaces the strings with their keys.
 *
 * @internal
 */
export const APPLY_ARG: IProgramArg = {
  alias: '--apply',
  options: {
    type: (value: string) => Boolean.parse(value),
    required: false,
    default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.apply,
    metavar: 'boolean',
    help: 'Replaces the hard-coded strings in the sources with keys and adds new keys to the catalog of the base locale, as one change set.',
  },
};

/**
 * Aggregate export for all detect command arguments.
 *
 * @internal
 */
export const DETECT_COMMAND_ARGS: Array<IProgramArg> = [
  ...CLI_ARGS,
  {
    alias: ['-t', '--type'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.type,
      metavar: 'string',
      help: 'The catalog format of the formatted keys.',
      choices: ['json', 'resx', 'po'],
    },
  },
  {
    alias: ['-r', '--root'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.root,
      metavar: 'string',
      help: 'The root directory of the sources to scan.',
    },
  },
  {
    alias: ['-p', '--preset'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.preset,
      metavar: 'string',
      help: 'The framework preset that decides which files are scanned.',
      choices: ['', 'angular', 'react', 'vue', 'lit', 'stencil'],
    },
  },
  {
    alias: ['-P', '--resource-key-prefix'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.resourceKeyPrefix,
      metavar: 'string',
      help: 'The prefix of a resource key. A value with it is a key and no hard-coded string.',
    },
  },
  {
    alias: ['-S', '--resource-key-suffix'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.resourceKeySuffix,
      metavar: 'string',
      help: 'The suffix of a resource key.',
    },
  },
  {
    alias: ['-R', '--resource-root'],
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.resourceRoot,
      metavar: 'string',
      help: 'The folder of the catalogs that --apply reads and adds new keys to.',
    },
  },
  {
    alias: '--base-locale',
    options: {
      required: false,
      default: DEFAULT_DETECT_COMMAND_ARGS_CONFIG.baseLocale,
      metavar: 'string',
      help: 'The locale that --apply adds new keys to.',
    },
  },
  SKIP_TESTS_ARG,
  APPLY_ARG,
  REVIEW_ARG,
];

// #endregion
