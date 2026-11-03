// #region Imports

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG_COMMAND_ARGS_CONFIG, type IConfigCommandArgsConfig } from '../arguments/configurations/IConfigCommandArgsConfig';
import { ConfigCommand } from './ConfigCommand';

// #endregion

describe('ConfigCommand', () => {
    let root: string;
    let file: string;

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-config-command-')));
        file = join(root, 'wortlaut.config.json');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(root, { recursive: true, force: true });
    });

    function createCommand(config: Partial<IConfigCommandArgsConfig>, logger = createLogger()): ConfigCommand {
        return new ConfigCommand({ ...DEFAULT_CONFIG_COMMAND_ARGS_CONFIG, cwd: root, ...config }, logger, new FileSystem());
    }

    it('lists every setting with its source', async () => {
        // arrange
        writeFileSync(file, JSON.stringify({ actions: { sort: { order: 'desc' } } }));
        const logger = createLogger();

        // act
        await createCommand({ action: 'list' }, logger).execute();

        // assert
        const printed = vi.mocked(logger.log).mock.calls.flat().join('\n');

        expect(printed).toMatch(/actions\.sort\.order.*desc/);
        expect(printed).toContain(`wortlaut-config: ${file}`);
        expect(printed).toMatch(/actions\.detect\.type.*json.*default/);
    });

    it('gets one setting, or the settings below a name, as JSON for scripts', async () => {
        // arrange
        const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

        // act
        await createCommand({ action: 'get', key: 'actions.sort', json: true }).execute();

        // assert
        const report = JSON.parse(String(stdout.mock.calls[0][0])) as { data: Array<{ key: string; source: { kind: string } }> };

        expect(report.data).toEqual([expect.objectContaining({ key: 'actions.sort.order', source: { kind: 'default', file: null } })]);
    });

    it('says so for a setting that does not exist', async () => {
        // act & assert
        await expect(createCommand({ action: 'get', key: 'nope' }).execute()).rejects.toThrow(/no setting 'nope'/);
    });

    it('sets a value through a change set, reading JSON where it is JSON', async () => {
        // act
        await createCommand({ action: 'set', key: 'actions.sort.order', value: 'desc' }).execute();
        await createCommand({ action: 'set', key: 'actions.detect.languages', value: '["en","de"]' }).execute();

        // assert
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ actions: { sort: { order: 'desc' }, detect: { languages: ['en', 'de'] } } });
    });

    it('writes nothing for set in a dry run', async () => {
        // act
        await createCommand({ action: 'set', key: 'actions.sort.order', value: 'desc', dryRun: true }).execute();

        // assert
        expect(existsSync(file)).toBe(false);
    });

    it('leaves a plain key out of the repository', async () => {
        // act & assert
        await expect(createCommand({ action: 'set', key: 'actions.generate.apiKey', value: 'sk-plain-key' }).execute()).rejects.toThrow(/accepts only a token/);
        expect(existsSync(file)).toBe(false);
    });

    it('asks for what set needs, and refuses an unknown action', async () => {
        // act & assert
        await expect(createCommand({ action: 'set', key: 'actions.sort.order' }).execute()).rejects.toThrow(/set <key> <value>/);
        await expect(createCommand({ action: 'explode' }).execute()).rejects.toThrow(/Unknown action/);
    });
});

function createLogger(): ILogger {
    return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}
