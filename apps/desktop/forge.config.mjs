// #region Imports

import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

/**
 * The root of the repository, where the manifest of the app and the builds are.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The icons of the package.
 */
const icons = resolve(root, 'apps/desktop/assets/icons');

/**
 * Where the bundle of main starts inside of the package. It holds every package it needs, so the package has no `node_modules`.
 */
const MAIN = 'dist/apps/desktop/main.cjs';

/**
 * The packaging of the desktop app, for this machine. It flips no fuse, as Resonanz does not, and signs with no certificate.
 */
export default {
    outDir: resolve(root, process.env['WORTLAUT_OUTPUT_DIR'] ?? 'out'),
    hooks: {
        async prePackage() {
            for (const relative of [MAIN, 'dist/apps/desktop/preload.cjs', 'dist/apps/frontend/app/browser/index.html', 'apps/desktop/assets/icons/wortlaut.icns', 'apps/desktop/assets/icons/wortlaut.ico', 'LICENSE']) {
                await access(resolve(root, relative));
            }
        },
        async packageAfterCopy(_forgeConfig, buildPath) {
            if (resolve(buildPath) === root) {
                throw new Error('The packaged manifest must be written only into the Forge staging directory.');
            }

            const manifest = JSON.parse(await readFile(join(buildPath, 'package.json'), 'utf8'));
            const runtimeManifest = {
                name: manifest.name,
                productName: manifest.productName,
                version: manifest.version,
                private: true,
                description: manifest.description,
                author: manifest.author,
                type: 'commonjs',
                main: MAIN,
                ...manifest.license ? { license: manifest.license } : {}
            };

            await writeFile(join(buildPath, 'package.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`, 'utf8');
        }
    },
    packagerConfig: {
        asar: true,

        // The hook above owns the manifest, and the default of Packager would remove `private`.
        sanitizePackageJson: [(manifest) => manifest],

        // The manifest of the repository names workspaces and local archives, and the bundles need none of them.
        prune: false,
        appBundleId: 'de.pixelbrewery.wortlaut',
        executableName: 'Wortlaut',
        icon: resolve(icons, 'wortlaut'),
        extraResource: [resolve(root, 'LICENSE')],
        ignore: [
            /^\/(?!dist(?:\/|$)|package\.json$)/,
            /^\/dist\/(?!apps(?:\/|$))/,
            /^\/dist\/apps\/(?!desktop(?:\/|$)|frontend(?:\/|$))/,
            /\.map$/
        ],

        // Sealing without a certificate keeps an Apple Silicon bundle launchable.
        ...process.platform === 'darwin'
            ? {
                osxSign: {
                    identity: '-',
                    identityValidation: false,
                    optionsForFile: () => ({ hardenedRuntime: false }),
                    continueOnError: false
                }
            }
            : {}
    },
    makers: [
        new MakerZIP({}, ['darwin', 'win32', 'linux']),
        new MakerDMG({ name: 'Wortlaut', title: 'Wortlaut', icon: resolve(icons, 'wortlaut.icns'), format: 'UDZO' }),
        new MakerSquirrel({ name: 'wortlaut', setupExe: 'WortlautSetup.exe', setupIcon: resolve(icons, 'wortlaut.ico') })
    ]
};
