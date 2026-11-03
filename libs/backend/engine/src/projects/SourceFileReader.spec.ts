// #region Imports

import { describe, expect, it } from 'vitest';
import { maskSecrets } from './SourceFileReader';

// #endregion

describe('maskSecrets', () => {
    it('masks a literal secret at any depth and leaves the rest as it is', () => {
        const text = '{\n  // comment\n  "actions": { "generate": { "apiKey": "sk-1", "model": "m" } },\n  "list": [{ "token": "abc" }]\n}';
        const masked = maskSecrets(text);

        expect(masked).not.toContain('sk-1');
        expect(masked).not.toContain('abc');
        expect(masked).toContain('// comment');
        expect(masked).toContain('"model": "m"');
        expect(masked).toContain('"apiKey": "***"');
    });

    it('keeps a token, which only names a variable', () => {
        expect(maskSecrets('{"apiKey":"{env.GEMINI_API_KEY}"}')).toContain('{env.GEMINI_API_KEY}');
    });

    it('masks a secret that is no string', () => {
        expect(maskSecrets('{"secret":{"value":"x"}}')).not.toContain('"x"');
    });

    it('refuses to show a file it cannot check', () => {
        expect(maskSecrets('')).toBe('This file could not be read as JSON, so it is not shown.');
    });
});
