// #region Imports

import { z } from 'zod';

// #endregion

/**
 * The engine commands that record a run. Reading the review list or the configuration records none.
 *
 * @public
 */
export const RunCommandNameSchema = z.enum([
  'detect',
  'detect.apply',
  'catalog.edit',
  'translations.propose',
  'analyze',
  'generate',
  'transform',
  'sort',
  'info',
  'ai.status',
  'init',
  'config.set',
  'changes.apply',
  'changes.discard',
  'changes.recover',
  'rules.install',
  'rules.update',
  'rules.settings',
  'mcp.read',
]);

/**
 * @public
 */
export type RunCommandName = z.output<typeof RunCommandNameSchema>;
