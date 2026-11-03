// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from './DesktopApi';

// #endregion

describe('DesktopApi', () => {
    afterEach(() => {
        delete (window as Window & { wortlaut?: unknown }).wortlaut;
    });

    it('says so outside of the desktop window', () => {
        expect(() => new DesktopApi().request('shell.state', {})).toThrow('Wortlaut runs only in its desktop window.');
    });

    it('goes through the bridge of the preload', async () => {
        const bridge = { request: vi.fn(() => Promise.resolve('answer')), onEvent: vi.fn(() => () => undefined) };

        (window as Window & { wortlaut?: unknown }).wortlaut = bridge;

        await expect(new DesktopApi().request('shell.state', {})).resolves.toBe('answer');
        expect(bridge.request).toHaveBeenCalledWith('shell.state', {});
        expect(typeof new DesktopApi().onEvent(() => undefined)).toBe('function');
    });
});
