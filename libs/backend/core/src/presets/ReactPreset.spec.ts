// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import { ReactPreset } from './ReactPreset';

// #endregion

describe('ReactPreset', () => {
    it('scans .tsx files', () => {
        // arrange
        const preset = new ReactPreset({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger);

        // act
        const extensions = preset.getExtensions();

        // assert
        expect(extensions).toContain('.tsx');
    });

    it('finds a translated string in a .tsx file', () => {
        // arrange
        const preset = new ReactPreset({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger);

        // act
        const results = preset.getParser('.tsx').detect('export const View = () => <button>{t("Save changes")}</button>;');

        // assert
        expect(results.map((result) => result.match.value)).toContain('Save changes');
    });
});
