// #region Imports

import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_OPTIONS } from './DefaultProjectOptions';
import { ProjectOptionsSchema } from './ProjectOptions';

// #endregion

describe('ProjectOptionsSchema', () => {
    it.each(['de', 'pt_BR', 'en-US', 'zh-Hant-TW', 'es-419'])('takes the locale %s', (locale) => {
        // act & assert
        expect(ProjectOptionsSchema.safeParse({ actions: { generate: { locales: [locale], baseLocale: locale }, analyze: { baseLocale: locale }, detect: { languages: [locale] } } }).success).toBe(true);
    });

    it.each(['x/../../../.claude/settings', '../de', 'de\\..\\x', ''])('refuses the locale %s, which would name a file elsewhere', (locale) => {
        // act & assert
        expect(ProjectOptionsSchema.safeParse({ actions: { generate: { locales: [locale] } } }).success).toBe(false);
        expect(ProjectOptionsSchema.safeParse({ actions: { generate: { baseLocale: locale } } }).success).toBe(false);
        expect(ProjectOptionsSchema.safeParse({ actions: { analyze: { baseLocale: locale } } }).success).toBe(false);
        expect(ProjectOptionsSchema.safeParse({ actions: { detect: { languages: [locale] } } }).success).toBe(false);
    });

    it('reads the options an Nx target of a consumer holds', () => {
        // act
        const result = ProjectOptionsSchema.safeParse({
            verbose: false,
            output: 'src/.generated/intl',
            cache: { enabled: false, dirPath: '.cache' },
            actions: {
                detect: { languages: ['en', 'de'], root: 'src', resourceRoot: ['assets/i18n'], preset: 'angular', resourceKey: { prefix: 'loc' }, type: 'json' },
                analyze: { identicalKeys: [], rules: ['empty-values'], usedKeys: ['loc.*'] },
                transform: { types: ['ts'] },
                sort: { order: 'asc' },
                generate: { strategy: '{env.GEMINI_STRATEGY}', apiKey: '{env.GEMINI_API_KEY}', chunkSize: 22, limit: 400, instructions: ['casual'], locales: ['de'] }
            }
        });

        // assert
        expect(result.success).toBe(true);
    });

    it('removes options it does not know, because Nx targets may carry their own', () => {
        // act
        const result = ProjectOptionsSchema.parse({ parallel: 3, actions: { sort: { order: 'desc', other: true } } });

        // assert
        expect(result).toEqual({ actions: { sort: { order: 'desc' } } });
    });

    it('rejects a value of the wrong kind and names it', () => {
        // act
        const result = ProjectOptionsSchema.safeParse({ actions: { detect: { preset: 'svelte' } } });

        // assert
        expect(result.error?.issues[0].path).toEqual(['actions', 'detect', 'preset']);
    });

    it('accepts its own defaults', () => {
        // act
        const result = ProjectOptionsSchema.safeParse(DEFAULT_PROJECT_OPTIONS);

        // assert
        expect(result.success).toBe(true);
    });
});
