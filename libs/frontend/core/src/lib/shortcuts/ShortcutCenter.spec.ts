// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { ShortcutCenter } from './ShortcutCenter';

// #endregion

function key(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent('keydown', { cancelable: true, ...init });
}

describe('ShortcutCenter', () => {
    it.each([
        ['k', 'search'],
        ['K', 'search'],
        ['Enter', 'run'],
        ['j', 'suggest'],
        ['ArrowDown', 'next']
    ] as const)('answers ⌘%s on a Mac with %s', (name, action) => {
        // arrange
        const center = new ShortcutCenter();
        const handler = vi.fn();

        center.setPlatform('darwin');
        center.bind({ [action]: handler });

        // act
        const event = key({ key: name, metaKey: true });

        center.handle(event);

        // assert
        expect(handler).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it.each(['win32', 'linux'])('uses Ctrl on %s and not the Windows key', (platform) => {
        // arrange
        const center = new ShortcutCenter();
        const handler = vi.fn();

        center.setPlatform(platform);
        center.bind({ run: handler });

        // act
        center.handle(key({ key: 'Enter', metaKey: true }));
        center.handle(key({ key: 'Enter', ctrlKey: true }));

        // assert
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not take Ctrl on a Mac, or a key with another modifier on top', () => {
        // arrange
        const center = new ShortcutCenter();
        const handler = vi.fn();

        center.setPlatform('darwin');
        center.bind({ search: handler });

        // act
        const taken = [
            center.handle(key({ key: 'k', ctrlKey: true })),
            center.handle(key({ key: 'k', metaKey: true, shiftKey: true })),
            center.handle(key({ key: 'k' }))
        ];

        // assert
        expect(taken).toEqual([false, false, false]);
        expect(handler).not.toHaveBeenCalled();
    });

    it('leaves a key alone that nobody offers, so the page keeps it', () => {
        // arrange
        const center = new ShortcutCenter();

        center.setPlatform('darwin');
        center.bind({ search: vi.fn() });

        // act
        const event = key({ key: 'ArrowDown', metaKey: true });
        const taken = center.handle(event);

        // assert
        expect(taken).toBe(false);
        expect(event.defaultPrevented).toBe(false);
    });

    it('lets the latest view answer, and the one before it again once it goes', () => {
        // arrange
        const center = new ShortcutCenter();
        const shell = vi.fn();
        const view = vi.fn();
        const other = vi.fn();

        center.setPlatform('darwin');
        center.bind({ search: shell, run: other });

        const unbind = center.bind({ run: view });

        // act
        center.handle(key({ key: 'Enter', metaKey: true }));
        center.handle(key({ key: 'k', metaKey: true }));
        unbind();
        center.handle(key({ key: 'Enter', metaKey: true }));

        // assert
        expect(view).toHaveBeenCalledTimes(1);
        expect(shell).toHaveBeenCalledTimes(1);
        expect(other).toHaveBeenCalledTimes(1);
    });

    it('writes the keys for the platform', () => {
        // arrange
        const center = new ShortcutCenter();

        // act
        center.setPlatform('darwin');

        const mac = center.labelOf('run');

        center.setPlatform('win32');

        // assert
        expect(mac).toBe('⌘ Enter');
        expect(center.labelOf('run')).toBe('Ctrl Enter');
    });
});
