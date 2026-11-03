// #region Imports

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { CommandFailureReportSchema, CommandReportSchema } from '@pixel-brewery/wortlaut-contracts';
import { ResourceMode } from '@pixel-brewery/wortlaut-core';
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHANGES_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IChangesCommandArgsConfig';
import { ChangesCommand } from './ChangesCommand';

// #endregion

describe('ChangesCommand', () => {
    let root: string;
    let file: string;
    let changeSetId: string;
    const unsorted = JSON.stringify({ b: 'B', a: 'A' });

    beforeEach(async () => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-changes-')));
        file = join(root, 'lang.en.json');
        writeFileSync(file, unsorted);

        const outcome = await new WortlautEngine({ surface: 'cli', logger: createLogger() }).sort({
            cwd: root,
            writeMode: 'review',
            options: { resourceRoot: [root], type: ResourceMode.Json, order: 'asc' }
        });

        changeSetId = outcome.changeSet?.id as string;
    });

    afterEach(async () => {
        await new WortlautEngine({ surface: 'cli', logger: createLogger() }).discardChangeSet(changeSetId, root).catch(() => undefined);
        vi.restoreAllMocks();
        rmSync(root, { recursive: true, force: true });
    });

    function createCommand(action: string, id = '', logger = createLogger()): ChangesCommand {
        return new ChangesCommand({ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG, cwd: root, action, id }, logger, new FileSystem());
    }

    it('names itself and declares its arguments', () => {
        // act
        const command = createCommand('list');

        // assert
        expect(command.name).toBe('changes');
        expect(command.args.flatMap((arg) => arg.alias)).toEqual(expect.arrayContaining(['--json', '--cwd']));
    });

    it('reads its action and id from the positionals', async () => {
        // arrange
        const previous = process.argv;
        process.argv = ['node', 'wortlaut', 'changes', 'show', changeSetId, '--json=true'];
        const command = createCommand('list');

        try {
            // act
            await command.initialize();
            command.configure({ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG });

            // assert
            expect(command.config).toMatchObject({ action: 'show', id: changeSetId });
        } finally {
            process.argv = previous;
        }
    });

    it('lists the pending change sets', async () => {
        // arrange
        const logger = createLogger();

        // act
        const result = await createCommand('list', '', logger).execute();

        // assert
        expect(result.canceled).toBe(false);
        expect(vi.mocked(logger.log).mock.calls.flat().join('\n')).toContain(changeSetId);
    });

    it('shows a change set as a diff', async () => {
        // arrange
        const logger = createLogger();

        // act
        await createCommand('show', changeSetId, logger).execute();

        // assert
        const printed = vi.mocked(logger.log).mock.calls.flat().join('\n');

        expect(printed).toContain(file);
        expect(printed).toContain('+  "a": "A"');
        expect(printed).toContain(`-${unsorted}`);
    });

    it('applies a change set', async () => {
        // act
        await createCommand('apply', changeSetId).execute();

        // assert
        expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object)).toEqual(['a', 'b']);
    });

    it('names the changed file when an apply fails, and writes nothing', async () => {
        // arrange
        writeFileSync(file, 'edited');

        // act & assert
        await expect(createCommand('apply', changeSetId).execute()).rejects.toThrow('lang.en.json');
        expect(readFileSync(file, 'utf8')).toBe('edited');
    });

    it('discards a change set', async () => {
        // arrange
        await createCommand('discard', changeSetId).execute();
        const logger = createLogger();

        // act
        await createCommand('list', '', logger).execute();

        // assert
        expect(readFileSync(file, 'utf8')).toBe(unsorted);
        expect(vi.mocked(logger.log).mock.calls.flat().join('\n')).not.toContain(changeSetId);
    });

    it('prints reports and failures as JSON documents', async () => {
        // arrange
        const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const list = new ChangesCommand({ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG, cwd: root, action: 'list', json: true }, createLogger(), new FileSystem());
        const apply = new ChangesCommand({ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG, cwd: root, action: 'apply', id: 'nope', json: true }, createLogger(), new FileSystem());

        // act
        await list.execute();
        await apply.execute();

        // assert
        const [listed, failed] = stdout.mock.calls.map(([text]) => JSON.parse(String(text)) as unknown);

        expect(CommandReportSchema.parse(listed).command).toBe('changes.list');
        expect(CommandFailureReportSchema.parse(failed).error.code).toBe('change-set-not-found');
    });

    it.each(['show', 'apply', 'discard'])('asks for the id of %s', async (action) => {
        // act & assert
        await expect(createCommand(action).execute()).rejects.toThrow(/Name the change set/);
    });

    it('refuses an action it does not know', async () => {
        // act & assert
        await expect(createCommand('explode').execute()).rejects.toThrow(/Unknown action/);
    });
});

function createLogger(): ILogger {
    return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

describe('ChangesCommand after a process died during an apply', () => {
    let root: string;
    let profile: string;
    let first: string;
    let second: string;
    let previousHome: string | undefined;
    const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
    const journalFile = (target: string, oldContent: string, newContent: string): Record<string, unknown> => ({
        target,
        staged: join(dirname(target), `.${basename(target)}.wortlaut-staged`),
        displayPath: basename(target),
        action: 'update',
        oldHash: hash(oldContent),
        newHash: hash(newContent),
        createdDirectory: null,
        previous: Buffer.from(oldContent).toString('base64'),
        mode: null
    });

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-changes-crash-')));
        profile = join(root, 'profile');
        first = join(root, 'crash.de.json');
        second = join(root, 'crash.en.json');
        previousHome = process.env.WORTLAUT_HOME;
        process.env.WORTLAUT_HOME = profile;

        // What a process that died between two renames leaves: its journal, one file written and the other one still staged.
        writeFileSync(first, 'new first');
        writeFileSync(second, 'old second');
        writeFileSync(join(root, '.crash.en.json.wortlaut-staged'), 'new second');
        mkdirSync(join(profile, 'journal'), { recursive: true });
        writeFileSync(join(profile, 'journal', 'crashed-set.json'), JSON.stringify({
            schemaVersion: 1,
            changeSetId: 'crashed-set',
            state: 'committing',
            pid: spawnSync(process.execPath, ['-e', '0']).pid,
            startedAt: new Date().toISOString(),
            cwd: root,
            source: { command: 'sort', surface: 'cli', runId: 'crashed-run', detail: null },
            partial: false,
            files: [journalFile(first, 'old first', 'new first'), journalFile(second, 'old second', 'new second')]
        }));
    });

    afterEach(() => {
        process.env.WORTLAUT_HOME = previousHome;
        rmSync(root, { recursive: true, force: true });
    });

    it('finishes the change set before the command does anything else, says so, and lists nothing that is done', async () => {
        // arrange
        const logger = createLogger();
        const command = new ChangesCommand({ ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG, cwd: root, action: 'list', id: '', json: true }, logger, new FileSystem());
        const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const warnings = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        // act
        await command.execute();

        // assert
        expect(readFileSync(second, 'utf8')).toBe('new second');
        expect(existsSync(join(root, '.crash.en.json.wortlaut-staged'))).toBe(false);
        expect(readdirSync(join(profile, 'journal'))).toEqual([]);
        expect(warnings.mock.calls.flat().join(' ')).toContain('Wortlaut finished it');
        output.mockRestore();
        warnings.mockRestore();
    });
});
