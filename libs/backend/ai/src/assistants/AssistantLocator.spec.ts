// #region Imports

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locateAssistant } from './AssistantLocator';

// #endregion

describe('locateAssistant', () => {
    let root: string;
    let home: string;
    let applications: string;

    function executable(path: string): string {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, '#!/bin/sh\n');
        chmodSync(path, 0o755);

        return path;
    }

    function locate(command: string, environment: Record<string, string | undefined> = {}, registered: Array<string> = [], platform: NodeJS.Platform = 'darwin'): string | null {
        return locateAssistant(command, { PATH: '', ...environment }, home, platform, { applicationFolders: [applications], registeredApplications: () => registered });
    }

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'wortlaut-locator-'));
        home = join(root, 'home');
        applications = join(root, 'Applications');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('should find Codex inside the ChatGPT application, where it is on no PATH', () => {
        const cli = join(applications, 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli');
        const found = executable(join(cli, 'bin', 'codex'));

        writeFileSync(join(cli, 'codex-package.json'), JSON.stringify({ layoutVersion: 1, entrypoint: 'bin/codex' }));

        expect(locate('codex')).toBe(found);
    });

    it('should find Codex in an application in the home of the user, and in its older layouts', () => {
        const found = executable(join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'));

        expect(locate('codex')).toBe(found);
    });

    // These two read the paths of this machine as those of a Mac.
    it.skipIf(process.platform === 'win32')('should prefer the PATH over an application', () => {
        executable(join(applications, 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'));

        const found = executable(join(root, 'bin', 'codex'));

        expect(locate('codex', { PATH: join(root, 'bin') })).toBe(found);
    });

    it.skipIf(process.platform === 'win32')('should honour the folder of the Codex installer', () => {
        const found = executable(join(root, 'installed', 'codex'));

        expect(locate('codex', { CODEX_INSTALL_DIR: join(root, 'installed') })).toBe(found);
    });

    it('should not follow a manifest out of its folder', () => {
        const cli = join(applications, 'Codex.app', 'Contents', 'Resources', 'codex-cli');
        const fallback = executable(join(cli, 'bin', 'codex'));

        executable(join(root, 'elsewhere'));
        writeFileSync(join(cli, 'codex-package.json'), JSON.stringify({ layoutVersion: 1, entrypoint: '../../../../../elsewhere' }));

        expect(locate('codex')).toBe(fallback);
    });

    it('should find an application that was moved, through what macOS knows', () => {
        const moved = join(root, 'Moved', 'ChatGPT.app');
        const found = executable(join(moved, 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'));

        expect(locate('codex', {}, [moved])).toBe(found);
    });

    it('should ask macOS only when the usual places hold nothing, and only for Codex', () => {
        const registeredApplications = vi.fn(() => []);

        executable(join(applications, 'ChatGPT.app', 'Contents', 'Resources', 'codex'));
        locateAssistant('codex', { PATH: '' }, home, 'darwin', { applicationFolders: [applications], registeredApplications });
        locateAssistant('claude', { PATH: '' }, home, 'darwin', { applicationFolders: [root], registeredApplications });
        locateAssistant('codex', { PATH: '' }, home, 'linux', { applicationFolders: [root], registeredApplications });

        expect(registeredApplications).not.toHaveBeenCalled();
    });

    it('should say that Codex is not installed when nothing is there', () => {
        expect(locate('codex')).toBeNull();
    });
});
