// #region Imports

import { join } from 'node:path';

// #endregion

/**
 * Returns the directory of the user's profile, which holds the review list and the run store. All surfaces of one user
 * share it. On macOS and Windows it is where Electron keeps the application data of Wortlaut.
 *
 * @public
 * @param env The environment. `WORTLAUT_HOME` overrides the location.
 * @param platform The platform.
 * @param home The user's home directory.
 * @returns The absolute path of the profile.
 */
export function resolveProfileRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
    if (env.WORTLAUT_HOME) {
        return env.WORTLAUT_HOME;
    }

    switch (platform) {
        case 'darwin':
            return join(home, 'Library', 'Application Support', 'Wortlaut');
        case 'win32':
            return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Wortlaut');
        default:
            return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'wortlaut');
    }
}
