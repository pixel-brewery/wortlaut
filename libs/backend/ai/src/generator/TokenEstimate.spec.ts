// #region Imports

import { describe, expect, it } from 'vitest';
import { estimateTokens, estimateTokensFor } from './TokenEstimate';

// #endregion

const rowsOf = (count: number): Array<{ key: string; value: string }> => Array.from({ length: count }, (_row, index) => ({ key: `loc.key.${index}`, value: 'A short text' }));

describe('estimateTokensFor', () => {
    it('counts what Codex adds to every chunk, which is most of what a run costs', () => {
        // act: a real run of 4 keys in one chunk reported about 15,000 tokens, and of 10 keys about 16,000
        const four = estimateTokensFor('codex', rowsOf(4), 1);
        const ten = estimateTokensFor('codex', rowsOf(10), 1);

        // assert
        expect(four.tokens).toBeGreaterThanOrEqual(14000);
        expect(four.tokens).toBeLessThan(16000);
        expect(ten.tokens).toBeGreaterThan(four.tokens);
        expect(ten.tokens).toBeLessThan(16500);
        expect(four.isLowerBound).toBe(false);
        expect(four.note).toContain('rough figure');
    });

    it('grows with the chunks, because each one starts the assistant again', () => {
        // act
        const one = estimateTokensFor('codex', rowsOf(10), 1);
        const two = estimateTokensFor('codex', rowsOf(10), 2);

        // assert
        expect(two.tokens - one.tokens).toBeGreaterThan(14000);
    });

    it.each([
        ['claude-code', 'Claude Code'],
        ['opencode', 'OpenCode']
    ])('gives no number it does not know for %s, and says what it leaves out', (provider, name) => {
        // act
        const estimate = estimateTokensFor(provider, rowsOf(4), 1);

        // assert
        expect(estimate.isLowerBound).toBe(true);
        expect(estimate.tokens).toBe(estimateTokens(rowsOf(4), 1));
        expect(estimate.note).toContain(name);
        expect(estimate.note).toContain('cannot tell');
    });

    it.each(['openai', 'google'])('counts the prompt and the answer for the API key provider %s', (provider) => {
        // act
        const estimate = estimateTokensFor(provider, rowsOf(4), 1);

        // assert
        expect(estimate.isLowerBound).toBe(false);
        expect(estimate.tokens).toBe(estimateTokens(rowsOf(4), 1));
        expect(estimate.note).toContain('prompt and the answer');
    });
});
