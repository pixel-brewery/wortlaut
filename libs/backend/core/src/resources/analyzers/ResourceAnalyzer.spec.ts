// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import { ResourceAnalyzer } from './ResourceAnalyzer';

// #endregion

describe('ResourceAnalyzer', () => {
    it('names its registered rules', () => {
        // arrange
        const analyzer = new ResourceAnalyzer({ log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger);

        // act & assert
        expect(analyzer.ruleNames).toEqual([
            'duplicate-keys',
            'duplicate-values',
            'empty-values',
            'key-consistency',
            'missing-translations',
            'unused-keys',
            'multiple-key-usage'
        ]);
    });
});
