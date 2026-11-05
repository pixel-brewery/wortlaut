// #region Imports

import { CONTENT_LANGUAGE_NAMES } from './ContentLanguageNames';

// #endregion

/**
 * ISO 639-1 language codes offered when adding a target language.
 * Existing project locales keep their original identifiers, including regional tags.
 *
 * @public
 */
export const CONTENT_LANGUAGE_CODES = Object.keys(CONTENT_LANGUAGE_NAMES) as ReadonlyArray<keyof typeof CONTENT_LANGUAGE_NAMES>;
