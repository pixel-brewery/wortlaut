// #region Imports

import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INFO_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IInfoCommandArgsConfig';
import { InfoCommand } from './InfoCommand';

// #endregion

describe('InfoCommand', () => {
    it('prints the machine', async () => {
        // arrange
        const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
        const command = new InfoCommand({ ...DEFAULT_INFO_COMMAND_ARGS_CONFIG }, logger, new FileSystem());

        // act
        await command.execute();

        // assert
        const printed = vi.mocked(logger.log).mock.calls.flat().join('\n');

        expect(printed).toContain('Platform');
        expect(printed).toContain(process.platform);
    });
});
