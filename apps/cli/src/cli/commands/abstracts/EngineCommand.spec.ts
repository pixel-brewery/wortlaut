// #region Imports

import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHANGES_COMMAND_ARGS_CONFIG } from '../../arguments/configurations/IChangesCommandArgsConfig';
import { ChangesCommand } from '../ChangesCommand';

// #endregion

describe('EngineCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits until a pipe took all of a JSON document, because the program exits right after a command', async () => {
    // arrange
    let flush: () => void = () => undefined;

    vi.spyOn(process.stdout, 'write').mockImplementation(((_text: string, callback: () => void) => {
      flush = callback;

      return false;
    }) as never);

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as unknown as ILogger;
    const command = new ChangesCommand(
      { ...DEFAULT_CHANGES_COMMAND_ARGS_CONFIG, json: true },
      logger,
      new FileSystem(),
    );
    let finished = false;

    // act
    const running = command.execute().then(() => {
      finished = true;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    // assert
    expect(finished).toBe(false);

    // act
    flush();
    await running;

    // assert
    expect(finished).toBe(true);
  });
});
