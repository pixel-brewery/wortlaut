// #region Imports

import type { IAiProviderHost } from '@pixel-brewery/wortlaut-ai';
import type { TestTranslateRequest } from '@pixel-brewery/wortlaut-contracts';
import { describe, expect, it, vi } from 'vitest';
import { TranslationLab } from './TranslationLab';

// #endregion

const KEY = 'key-of-the-user-1234';

const REQUEST = {
    locale: 'de',
    instructions: '',
    rows: [{ key: 'a', base: 'A', comment: '' }],
    setups: [{ provider: 'openai', model: 'a-model', temperature: 0 }]
} as unknown as TestTranslateRequest;

function labWith(transcribe: () => Promise<never>): TranslationLab {
    const ai = {
        get: () => Promise.resolve({ name: 'OpenAI', state: 'ready', description: '' }),
        prepare: () => Promise.resolve({ strategy: { transcribe }, secrets: [KEY] })
    } as unknown as IAiProviderHost;

    return new TranslationLab({ ai, now: () => 0, createId: () => 'comparison' });
}

describe('TranslationLab', () => {
    it('keeps the key out of a failure in which a provider echoes it', async () => {
        // arrange
        const lab = labWith(() => Promise.reject(new Error(`401: the key ${KEY} is not valid`)));

        // act
        lab.start(REQUEST, 'json', 'en');
        await vi.waitFor(() => expect(lab.get('comparison')?.isRunning).toBe(false));

        // assert
        const setup = lab.get('comparison')?.setups[0];

        expect(setup?.status).toBe('failed');
        expect(setup?.failure).toContain('***');
        expect(setup?.failure).not.toContain(KEY);
    });
});
