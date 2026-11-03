// #region Imports

import { describe, expect, it } from 'vitest';
import { countOf, formatCount, formatDuration, formatInstant, formatName, localeList, localeName, presetName, surfaceName } from './Format';

// #endregion

describe('Format', () => {
    it('names locales in English and falls back to the code', () => {
        expect(localeName('de')).toBe('German');
        expect(localeName('pt_BR')).toBe('Brazilian Portuguese');
        expect(localeName('!!')).toBe('!!');
    });

    it('writes locales as a sentence', () => {
        expect(localeList(['en', 'de'])).toBe('English and German');
        expect(localeList(['en', 'de', 'fr'])).toBe('English, German, and French');
    });

    it('writes counts with their noun', () => {
        expect(formatCount(13209)).toBe('13,209');
        expect(countOf(1, 'project')).toBe('1 project');
        expect(countOf(26, 'project')).toBe('26 projects');
        expect(countOf(0, 'key')).toBe('0 keys');
    });

    it('names presets, formats and surfaces', () => {
        expect(presetName('angular')).toBe('Angular');
        expect(presetName(null)).toBe('No preset');
        expect(formatName('json')).toBe('JSON');
        expect(formatName('ts')).toBe('TypeScript');
        expect(surfaceName('desktop')).toBe('Desktop app');
        expect(surfaceName('mcp')).toBe('MCP');
        expect(surfaceName('mcp', 'Claude Code')).toBe('Claude Code via MCP');
    });

    it('writes an instant for its viewer', () => {
        const now = new Date(2026, 10, 2, 15, 0);

        expect(formatInstant(new Date(2026, 10, 2, 14, 59, 30).toISOString(), now)).toBe('Just now');
        expect(formatInstant(new Date(2026, 10, 2, 14, 58).toISOString(), now)).toBe('2 min ago');
        expect(formatInstant(new Date(2026, 10, 2, 9, 5).toISOString(), now)).toBe('Today, 09:05');
        expect(formatInstant(new Date(2026, 10, 1, 16, 42).toISOString(), now)).toBe('Yesterday, 16:42');
        expect(formatInstant(new Date(2026, 9, 29, 9, 30).toISOString(), now)).toBe('Thursday, 09:30');
        expect(formatInstant(new Date(2026, 0, 5, 9, 30).toISOString(), now)).toBe('5 Jan 2026, 09:30');
    });

    it('writes a duration', () => {
        expect(formatDuration(1800)).toBe('1.8 s');
        expect(formatDuration(144_000)).toBe('2 min 24 s');
    });
});
