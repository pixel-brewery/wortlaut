// #region Imports

import { describe, expect, it } from 'vitest';
import { SecretScrubber } from './SecretScrubber';

// #endregion

describe('SecretScrubber', () => {
    it('masks a known secret wherever it appears, also URL-encoded', () => {
        // arrange
        const scrubber = new SecretScrubber();
        scrubber.add('sk/secret+1');

        // act
        const text = scrubber.scrub('key sk/secret+1 in https://api.example.com?key=sk%2Fsecret%2B1');

        // assert
        expect(text).toBe('key *** in https://api.example.com?key=***');
    });

    it('drops options named like a secret and keeps the others, at any depth', () => {
        // arrange
        const scrubber = new SecretScrubber();

        // act
        const options = scrubber.sanitize({ apiKey: 'sk-1', resourceKeyPrefix: 'loc', nested: { clientSecret: 'x', model: 'm' }, list: [{ token: 't', a: 1 }] });

        // assert
        expect(options).toEqual({ resourceKeyPrefix: 'loc', nested: { model: 'm' }, list: [{ a: 1 }] });
    });

    it('masks a secret that was pasted into an ordinary option', () => {
        // arrange
        const scrubber = new SecretScrubber();
        scrubber.add('sk-secret');

        // act
        const options = scrubber.sanitize({ instructions: ['use sk-secret'] });

        // assert
        expect(options).toEqual({ instructions: ['use ***'] });
    });

    it('ignores an empty value', () => {
        // arrange
        const scrubber = new SecretScrubber();
        scrubber.add('');

        // act & assert
        expect(scrubber.scrub('text')).toBe('text');
    });
});
