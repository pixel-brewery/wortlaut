// #region Imports

import { z } from 'zod';
import { IdSchema } from './ShellDtos.js';

// #endregion

/**
 * Asks the search of the title bar. The commands come from the routes of the app, so main looks at keys and files.
 *
 * @public
 */
export const SearchQueryRequestSchema = z.strictObject({
  text: z.string().min(1).max(200),
  workspaceId: IdSchema,

  /**
   * The open project, whose results come first.
   */
  projectId: IdSchema.nullable(),
});

/**
 * A key of a catalog.
 *
 * @public
 */
export const SearchKeyResultSchema = z.strictObject({
  key: z.string(),
  value: z.string(),
  projectId: IdSchema,
  projectName: z.string(),
});

/**
 * @public
 */
export type SearchKeyResult = z.output<typeof SearchKeyResultSchema>;

/**
 * A file of a project. It is named by an id, and main knows where it is.
 *
 * @public
 */
export const SearchFileResultSchema = z.strictObject({
  id: IdSchema,
  file: z.string(),
  kind: z.enum(['catalog', 'settings', 'source']),
  projectId: IdSchema,
  projectName: z.string(),
});

/**
 * @public
 */
export type SearchFileResult = z.output<typeof SearchFileResultSchema>;

/**
 * What the search found.
 *
 * @public
 */
export const SearchResultsSchema = z.strictObject({
  keys: z.array(SearchKeyResultSchema),
  files: z.array(SearchFileResultSchema),

  /**
   * There is more than these, so a longer text finds it.
   */
  truncated: z.boolean(),
});

/**
 * @public
 */
export type SearchResults = z.output<typeof SearchResultsSchema>;
