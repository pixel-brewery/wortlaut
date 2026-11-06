// #region Imports

import type { IProgramArg } from '@pixel-brewery/utilities';
import { CLI_ARGS, REVIEW_ARG } from '../CliArgs.js';
import { DEFAULT_CATALOG_COMMAND_ARGS_CONFIG } from './configurations/ICatalogCommandArgsConfig.js';

// #endregion

/**
 * The arguments of the `catalog` command, besides its positionals `set <key> <value>`, `comment <key> <text>`,
 * `delete <key>`, `merge <keep> <remove...>` and `add-locale <locale>`.
 *
 * @internal
 */
export const CATALOG_COMMAND_ARGS: Array<IProgramArg> = [
  ...CLI_ARGS,
  REVIEW_ARG,
  {
    alias: '--locale',
    options: {
      required: false,
      default: DEFAULT_CATALOG_COMMAND_ARGS_CONFIG.locale,
      metavar: 'string',
      help: 'The locale that set and comment change.',
    },
  },
  {
    alias: ['-R', '--resource-root'],
    options: {
      required: false,
      default: DEFAULT_CATALOG_COMMAND_ARGS_CONFIG.resourceRoot,
      metavar: 'string',
      help: 'The folder of the catalogs. By default the one of the configuration.',
    },
  },
  {
    alias: ['-t', '--type'],
    options: {
      required: false,
      default: DEFAULT_CATALOG_COMMAND_ARGS_CONFIG.type,
      metavar: 'string',
      help: 'The format of the catalogs.',
      choices: ['json', 'resx', 'po'],
    },
  },
  {
    alias: '--base-locale',
    options: {
      required: false,
      default: DEFAULT_CATALOG_COMMAND_ARGS_CONFIG.baseLocale,
      metavar: 'string',
      help: 'The base locale.',
    },
  },
];
