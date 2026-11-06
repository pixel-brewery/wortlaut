// #region Imports

import type { ProjectOptions } from './ProjectOptions.js';

// #endregion

/**
 * The value of every setting that no file and no argument sets. The CLI's defaults and `run()` read the same values.
 *
 * @public
 */
export const DEFAULT_PROJECT_OPTIONS = {
  verbose: false,
  dryRun: false,
  review: false,
  actions: {
    detect: {
      languages: [],
      root: '',
      resourceRoot: '',
      preset: '',
      type: 'json',
      resourceKey: {
        prefix: '',
        suffix: '',
      },
    },
    sort: {
      order: 'asc',
    },
    analyze: {
      rules: [],
      usedKeys: [],
      baseLocale: 'en',
      identicalKeys: [],
      identicalValues: [],
    },
    transform: {
      types: [],
    },
    generate: {
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      locales: [],
      baseLocale: 'en',
      chunkSize: 10,
      limit: null,
      instructions: '',
      onlyNew: false,
      scope: 'all',
      namespace: '',
      strategy: 'openai',
    },
  },
} as const satisfies ProjectOptions;
