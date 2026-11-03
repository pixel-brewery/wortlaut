// #region Imports

import { Container, FileSystem, Program } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cli } from './Cli';

// #endregion

describe('Cli', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides a file system to its commands', async () => {
        // arrange
        vi.spyOn(Program.prototype, 'init').mockImplementation(function (this: Program<never>) {
            return Promise.resolve(this);
        });

        // act
        await new Cli().init();

        // assert
        expect(Container.instance.get('fileSystem')).toBeInstanceOf(FileSystem);
    });

    it('offers the commands of the review workflow next to the existing ones', () => {
        // arrange
        const cli = new Cli();

        // act
        const names = (cli.commands as unknown as { _commandTypes: Array<{ name: string }> })._commandTypes.map((command) => command.name);

        // assert
        expect(names).toEqual(['info', 'ai', 'analyze', 'generate', 'sort', 'transform', 'detect', 'init', 'config', 'changes', 'catalog', 'rules', 'mcp']);
    });

    it('keeps the exit code a command that finished asked for', () => {
        // arrange
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        process.exitCode = 1;

        // act
        new Cli().exit(0);

        // assert
        expect(exit).toHaveBeenCalledWith(1);

        process.exitCode = 0;
        new Cli().exit(0);
        expect(exit).toHaveBeenLastCalledWith(0);
    });

    it('lets boolean flags stand without a value anywhere on the command line', () => {
        // act
        const argv = Cli.normalizeArguments(['node', 'wortlaut', 'sort', '--json', '--dry-run', 'false', '--review', '--only-new', '--force', '-d', '--order', 'desc']);

        // assert
        expect(argv).toEqual(['node', 'wortlaut', 'sort', '--json=true', '--dry-run', 'false', '--review=true', '--only-new=true', '--force=true', '--debug=true', '--order', 'desc']);
    });
});
