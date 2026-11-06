// #region Imports

import { Writable } from 'node:stream';

// #endregion

/**
 * Keeps stdout for the protocol. One stray line there breaks the client, and a tool reaches a lot of code that may log, so from
 * here on whatever writes to `process.stdout`, `console.log` included, ends up on stderr. Only the stream this returns reaches
 * the real stdout.
 *
 * @public
 * @param stdout The stream to reserve.
 * @param stderr Where everything else goes.
 * @returns The stream of the protocol.
 */
export function reserveStdoutForProtocol(
  stdout: NodeJS.WriteStream = process.stdout,
  stderr: NodeJS.WriteStream = process.stderr,
): Writable {
  const write = stdout.write.bind(stdout) as (
    chunk: unknown,
    callback: (error?: Error | null) => void,
  ) => boolean;

  stdout.write = stderr.write.bind(stderr) as typeof stdout.write;

  return new Writable({
    write: (chunk, _encoding, callback) => {
      write(chunk, callback);
    },
  });
}
