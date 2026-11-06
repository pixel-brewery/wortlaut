// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { reserveStdoutForProtocol } from './StdoutGuard';

// #endregion

describe('reserveStdoutForProtocol', () => {
  function streams() {
    const toStdout = vi.fn((_chunk: unknown, callback?: unknown) => {
      if (typeof callback === 'function') {
        (callback as () => void)();
      }

      return true;
    });
    const toStderr = vi.fn(() => true);

    return {
      stdout: { write: toStdout } as unknown as NodeJS.WriteStream,
      stderr: { write: toStderr } as unknown as NodeJS.WriteStream,
      toStdout,
      toStderr,
    };
  }

  it('sends everything that writes to stdout to stderr instead', () => {
    // arrange
    const { stdout, stderr, toStdout, toStderr } = streams();

    reserveStdoutForProtocol(stdout, stderr);

    // act
    stdout.write('a stray line\n');

    // assert
    expect(toStderr).toHaveBeenCalledWith('a stray line\n');
    expect(toStdout).not.toHaveBeenCalled();
  });

  it('lets only the stream it returns reach stdout', async () => {
    // arrange
    const { stdout, stderr, toStdout, toStderr } = streams();
    const protocol = reserveStdoutForProtocol(stdout, stderr);

    // act
    await new Promise<void>((resolve) => {
      protocol.write('{"jsonrpc":"2.0"}\n', () => resolve());
    });

    // assert
    expect(toStdout).toHaveBeenCalledTimes(1);
    expect(String(toStdout.mock.calls[0][0])).toBe('{"jsonrpc":"2.0"}\n');
    expect(toStderr).not.toHaveBeenCalled();
  });
});
