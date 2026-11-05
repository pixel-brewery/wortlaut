// #region Imports

import { REGION_FLAGS } from './RegionFlags';

// #endregion

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const UNASSIGNED_LANGUAGES = new Set(['und', 'mul', 'zxx']);
const DEFAULT_REGIONS: Readonly<Partial<Record<string, string>>> = { en: 'GB', pt: 'PT' };

/**
 * Returns the registered Reicon flag name for a locale, keeping an explicit region before language defaults.
 * Unsupported locales and regions have no flag; their textual language label remains authoritative.
 *
 * @public
 * @param code The catalog locale, including identifiers that use underscores.
 * @returns Its registered flag name, or `undefined` when no appropriate Reicon definition exists.
 */
export function localeFlagIcon(code: string | null | undefined): string | undefined {
    if (!code) {
        return undefined;
    }

    try {
        const locale = new Intl.Locale(code.replaceAll('_', '-'));

        if (!locale.language || UNASSIGNED_LANGUAGES.has(locale.language) || !LANGUAGE_NAMES.of(locale.language)) {
            return undefined;
        }

        // Maximizing an explicit unknown region such as ZZ would silently replace it with a different country.
        const region = locale.region ?? DEFAULT_REGIONS[locale.language] ?? locale.maximize().region;

        return region && (/^[A-Z]{2}$/).test(region) && Object.hasOwn(REGION_FLAGS, region) ? `localeFlag${region}` : undefined;
    } catch {
        return undefined;
    }
}
