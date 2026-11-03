// #region Imports

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProfileRoot } from './Profile';

// #endregion

describe('resolveProfileRoot', () => {
    it('follows WORTLAUT_HOME on every platform', () => {
        // act & assert
        expect(resolveProfileRoot({ WORTLAUT_HOME: '/custom' }, 'darwin', '/profile/me')).toBe('/custom');
    });

    it.each([
        ['darwin', {}, join('/profile/me', 'Library', 'Application Support', 'Wortlaut')],
        ['win32', { APPDATA: 'C:/roaming' }, join('C:/roaming', 'Wortlaut')],
        ['linux', {}, join('/profile/me', '.local', 'share', 'wortlaut')],
        ['linux', { XDG_DATA_HOME: '/xdg' }, join('/xdg', 'wortlaut')]
    ] as const)('uses the place of the platform %s', (platform, env, expected) => {
        // act & assert
        expect(resolveProfileRoot(env, platform, '/profile/me')).toBe(expected);
    });
});
