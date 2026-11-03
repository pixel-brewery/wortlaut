// #region Imports

import { describe, expect, it } from 'vitest';
import { findSecretNames, isSecretName, readEnvToken } from './Secrets';

// #endregion

describe('Secrets', () => {
    it.each(['apiKey', 'api_key', 'API-KEY', 'authToken', 'clientSecret', 'password'])('treats %s as a secret', (name) => {
        // act & assert
        expect(isSecretName(name)).toBe(true);
    });

    it.each(['resourceKey', 'usedKeys', 'identicalKeys', 'prefix', 'model'])('treats %s as an ordinary option', (name) => {
        // act & assert
        expect(isSecretName(name)).toBe(false);
    });

    it('finds secret options at any depth', () => {
        // act
        const names = findSecretNames({ actions: { generate: { apiKey: 'x', model: 'y' } }, list: [{ token: 'z' }] });

        // assert
        expect(names).toEqual(['actions.generate.apiKey', 'list[0].token']);
    });

    it('reads the variable of a token and nothing else', () => {
        // act & assert
        expect(readEnvToken('{env.GEMINI_API_KEY}')).toBe('GEMINI_API_KEY');
        expect(readEnvToken('prefix {env.GEMINI_API_KEY}')).toBeNull();
        expect(readEnvToken('sk-plain')).toBeNull();
        expect(readEnvToken(42)).toBeNull();
    });
});
