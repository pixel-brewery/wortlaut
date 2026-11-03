// #region Imports

import { describe, expect, it } from 'vitest';
import { AsyncValue } from './AsyncValue';

// #endregion

describe('AsyncValue', () => {
    it('starts loading with nothing to show', () => {
        const value = new AsyncValue(() => Promise.resolve(1));

        expect(value.status()).toBe('loading');
        expect(value.isLoading()).toBe(true);
        expect(value.value()).toBeNull();
    });

    it('holds the value after a load', async () => {
        const value = new AsyncValue(() => Promise.resolve(1));

        await value.reload();

        expect(value.status()).toBe('ready');
        expect(value.value()).toBe(1);
        expect(value.isLoading()).toBe(false);
    });

    it('turns a rejection into a failure state, without rejecting', async () => {
        const value = new AsyncValue<number>(() => Promise.reject(new Error('The folder is gone.')));

        await expect(value.reload()).resolves.toBeUndefined();

        expect(value.isFailed()).toBe(true);
        expect(value.error()).toBe('The folder is gone.');
        expect(value.value()).toBeNull();
    });

    it('clears a failure when a later load succeeds', async () => {
        let attempt = 0;
        const value = new AsyncValue(() => ++attempt === 1 ? Promise.reject(new Error('No')) : Promise.resolve(attempt));

        await value.reload();
        await value.reload();

        expect(value.status()).toBe('ready');
        expect(value.error()).toBeNull();
        expect(value.value()).toBe(2);
    });

    it('keeps the value visible while it loads again', async () => {
        let resolve: (next: number) => void = () => undefined;
        let first = true;
        const value = new AsyncValue(() => {
            if (first) {
                first = false;

                return Promise.resolve(1);
            }

            return new Promise<number>((done) => {
                resolve = done;
            });
        });

        await value.reload();

        const reloading = value.reload();

        expect(value.status()).toBe('loading');
        expect(value.isLoading()).toBe(false);
        expect(value.value()).toBe(1);

        resolve(2);
        await reloading;

        expect(value.value()).toBe(2);
    });

    it('lets only the latest load count', async () => {
        const resolvers = new Array<(next: number) => void>();
        const value = new AsyncValue(() => new Promise<number>((done) => {
            resolvers.push(done);
        }));
        const slow = value.reload();
        const fast = value.reload();

        resolvers[1](2);
        await fast;
        resolvers[0](1);
        await slow;

        expect(value.value()).toBe(2);
    });
});
