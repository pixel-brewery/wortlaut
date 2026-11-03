// #region Imports

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { createEnvironmentKeySource, type IAiProviderHost } from '@pixel-brewery/wortlaut-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IAiCommandArgsConfig';
import { AiCommand } from './AiCommand';

// #endregion

const KEY = 'test-key-not-real';

describe('AiCommand', () => {
    let home: string;
    let argv: Array<string>;

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'wortlaut-ai-command-'));
        argv = process.argv;
        vi.stubEnv('WORTLAUT_HOME', home);
    });

    afterEach(() => {
        process.argv = argv;
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        rmSync(home, { recursive: true, force: true });
    });

    function create(line: Array<string>): { command: AiCommand; logger: ILogger; host: IAiProviderHost } {
        process.argv = ['node', 'wortlaut', 'ai', ...line];

        const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
        const host = {
            list: vi.fn(() => Promise.resolve([{ id: 'codex', name: 'Codex', kind: 'local', state: 'not-installed', description: 'Not installed' }])),
            dispose: vi.fn(() => Promise.resolve())
        } as unknown as IAiProviderHost;

        return { command: new AiCommand({ ...DEFAULT_AI_COMMAND_ARGS_CONFIG, cwd: home }, logger, new FileSystem(), () => host), logger, host };
    }

    it('lists the true state of every provider, and stops what it started', async () => {
        // arrange
        const { command, logger, host } = create(['status']);

        await command.initialize();

        // act
        const result = await command.execute();

        // assert
        expect(result.result).toEqual([expect.objectContaining({ id: 'codex', state: 'not-installed' })]);
        expect(vi.mocked(logger.log).mock.calls.flat().join(' ')).toContain('not-installed');
        expect(host.dispose).toHaveBeenCalled();
    });

    it('refuses anything but status', async () => {
        // arrange
        const { command, host } = create(['login']);

        await command.initialize();

        // act & assert
        await expect(command.execute()).rejects.toThrow('Usage: wortlaut ai status');
        expect(host.list).not.toHaveBeenCalled();
    });

    it('learns about keys from the environment only, and never holds one in its report', async () => {
        // arrange
        const keys = createEnvironmentKeySource({ OPENAI_API_KEY: KEY });

        // act & assert
        await expect(keys.has('openai')).resolves.toBe(true);
        await expect(keys.has('google')).resolves.toBe(false);
        await expect(keys.get('openai')).resolves.toBe(KEY);
    });
});
