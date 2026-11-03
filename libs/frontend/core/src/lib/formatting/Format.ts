// #region Imports

import type { Surface } from '@pixel-brewery/wortlaut-contracts';

// #endregion

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' });
const LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
const NUMBERS = new Intl.NumberFormat('en');
const SURFACES: Readonly<Record<Surface, string>> = { cli: 'CLI', nx: 'Nx', api: 'API', desktop: 'Desktop app', mcp: 'MCP' };
const PRESETS: Readonly<Record<string, string>> = { angular: 'Angular', lit: 'Lit', react: 'React', stencil: 'Stencil', vue: 'Vue' };
const FORMATS: Readonly<Record<string, string>> = { json: 'JSON', resx: 'RESX', po: 'PO', ts: 'TypeScript' };

/**
 * Returns the English name of a locale.
 *
 * @param code The locale.
 * @returns Its name, or the code when it has none.
 */
export function localeName(code: string): string {
    try {
        return LANGUAGE_NAMES.of(code.replace('_', '-')) ?? code;
    } catch {
        return code;
    }
}

/**
 * Writes the names of locales as a sentence.
 *
 * @param codes The locales.
 * @returns For example `English and German`.
 */
export function localeList(codes: ReadonlyArray<string>): string {
    return LIST.format(codes.map((code) => localeName(code)));
}

/**
 * Formats a count.
 *
 * @param value The count.
 * @returns For example `13,209`.
 */
export function formatCount(value: number): string {
    return NUMBERS.format(value);
}

/**
 * Writes a count with its noun.
 *
 * @param count The count.
 * @param one The noun for one.
 * @param many The noun for several, by default with an `s`.
 * @returns For example `1 project` or `26 projects`.
 */
export function countOf(count: number, one: string, many = `${one}s`): string {
    return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * Returns the name of a preset.
 *
 * @param preset The preset.
 * @returns Its name.
 */
export function presetName(preset: string | null): string {
    return preset ? PRESETS[preset] ?? preset : 'No preset';
}

/**
 * Returns the name of a catalog format.
 *
 * @param format The format.
 * @returns Its name.
 */
export function formatName(format: string): string {
    return FORMATS[format] ?? format;
}

/**
 * Returns the name of a surface.
 *
 * @param surface The surface.
 * @param client The assistant behind a run through MCP.
 * @returns Its name, for example `Desktop app` or `Claude Code via MCP`.
 */
export function surfaceName(surface: Surface, client: string | null = null): string {
    return client ? `${client} via ${SURFACES[surface]}` : SURFACES[surface];
}

/**
 * Writes an instant for its viewer: relative while it is recent, otherwise with the day in the viewer's time zone.
 *
 * @param instant The instant.
 * @param now The present.
 * @returns For example `2 min ago`, `Yesterday, 16:42` or `Monday, 09:30`.
 */
export function formatInstant(instant: string, now: Date): string {
    const date = new Date(instant);
    const elapsed = now.getTime() - date.getTime();
    const minutes = Math.floor(elapsed / 60_000);

    if (minutes < 1) {
        return 'Just now';
    }

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const days = daysBetween(date, now);

    if (days === 0) {
        return `Today, ${time}`;
    }

    if (days === 1) {
        return `Yesterday, ${time}`;
    }

    return days < 7
        ? `${date.toLocaleDateString('en-GB', { weekday: 'long' })}, ${time}`
        : `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
}

/**
 * Writes a duration.
 *
 * @param milliseconds The duration.
 * @returns For example `1.8 s` or `2 min 24 s`.
 */
export function formatDuration(milliseconds: number): string {
    if (milliseconds < 60_000) {
        return `${(milliseconds / 1000).toFixed(1)} s`;
    }

    const seconds = Math.round(milliseconds / 1000);

    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * @private
 */
function daysBetween(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();

    return Math.round((end - start) / 86_400_000);
}
