// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import { SecretScrubber } from '../security/SecretScrubber';
import { RunLogger } from './RunLogger';

// #endregion

describe('RunLogger', () => {
  it('forwards to the surface and keeps an entry without colors', () => {
    // arrange
    const { logger, target } = createLogger();

    // act
    logger.warn('\u001B[33mcareful\u001B[39m');

    // assert
    expect(target.warn).toHaveBeenCalledWith('\u001B[33mcareful\u001B[39m');
    expect(logger.entries).toEqual([{ level: 'warn', message: 'careful' }]);
  });

  it('keeps a secret out of the surface and out of the run', () => {
    // arrange
    const { logger, target, scrubber } = createLogger();
    scrubber.add('sk-secret');

    // act
    logger.error('provider said %s', 'invalid key sk-secret');

    // assert
    expect(target.error).toHaveBeenCalledWith('provider said invalid key ***');
    expect(JSON.stringify(logger.entries)).not.toContain('sk-secret');
  });

  it('keeps the newest entries beyond its bound and counts the others', () => {
    // arrange
    const { logger } = createLogger();

    // act
    for (let index = 0; index < 2005; index++) {
      logger.log(`line ${index}`);
    }

    // assert
    expect(logger.entries).toHaveLength(2000);
    expect(logger.entries[0].message).toBe('line 5');
    expect(logger.dropped).toBe(5);
  });

  it('cuts a very long entry', () => {
    // arrange
    const { logger } = createLogger();

    // act
    logger.log('x'.repeat(5000));

    // assert
    expect(logger.entries[0].message).toHaveLength(4000);
  });
});

function createLogger() {
  const target = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
  const scrubber = new SecretScrubber();

  return { logger: new RunLogger(target, scrubber), target, scrubber };
}
