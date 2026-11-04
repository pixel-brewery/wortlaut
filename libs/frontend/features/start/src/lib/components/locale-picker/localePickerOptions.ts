// #region Imports

import { CONTENT_LANGUAGE_CODES, localeName } from '@pixel-brewery/wortlaut-frontend-core';
import type { ILocaleOption } from './ILocaleOption';

// #endregion

const LANGUAGES: ReadonlyArray<ILocaleOption> = CONTENT_LANGUAGE_CODES
    .map((code) => ({ code, name: localeName(code) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));

/**
 * Offers unselected ISO languages, searched by English name or literal code.
 * Exclusions compare complete identifiers, so regional project locales stay distinct.
 *
 * @param excludedCodes The base and target identifiers already present in the project.
 * @param query The language name or code to find.
 * @returns Matching languages in English name order.
 */
export function localePickerOptions(excludedCodes: ReadonlyArray<string>, query = ''): ReadonlyArray<ILocaleOption> {
    const excluded = new Set(excludedCodes.map((code) => code.trim().toLowerCase()));
    const search = query.trim().toLowerCase();

    return LANGUAGES.filter(({ code, name }) => !excluded.has(code) && (code.includes(search) || name.toLowerCase().includes(search)));
}

/**
 * Rechecks a pending selection against the current project before it leaves the dialog.
 * Search visibility never removes an already checked language.
 *
 * @param selectedCodes The language identifiers checked in this dialog.
 * @param excludedCodes The project's current base and targets.
 * @returns Only currently available catalog identifiers, without duplicates.
 */
export function selectedLocaleCodes(selectedCodes: ReadonlySet<string>, excludedCodes: ReadonlyArray<string>): ReadonlyArray<string> {
    return localePickerOptions(excludedCodes).filter(({ code }) => selectedCodes.has(code))
        .map(({ code }) => code);
}
